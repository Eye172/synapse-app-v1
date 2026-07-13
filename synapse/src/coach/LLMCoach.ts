import type { FrameGrade, SafetyAlert } from '@/src/engine/ruleEngine';
import type { RepRecord, SetSummary } from '@/src/engine/setSession';
import type { ExerciseSpec } from '@/src/engine/types';

import { RuleCoach, buildRuleSummary } from './RuleCoach';
import type { Coach, CoachCue } from './types';

/**
 * LLMCoach (§2.8): Claude narrates what the rule engine measured — it never
 * computes a grade and never sees a camera frame. Layered on RuleCoach:
 *
 *   eligibility + rate limits → RuleCoach (deterministic, unchanged)
 *   safety alerts             → RuleCoach verbatim (no network in that path)
 *   in-set phrasing           → claude-haiku-4-5, ≤8 words, 2s deadline,
 *                               deterministic cue speaks on any miss
 *   end-of-set report         → claude-sonnet-5, grounded in SetSummary JSON
 *
 * No API key / any error → the caller falls back to RuleCoach entirely.
 */

const CUE_MODEL = 'claude-haiku-4-5';
const REPORT_MODEL = 'claude-sonnet-5';
const CUE_DEADLINE_MS = 2000;
const REPORT_TIMEOUT_MS = 20000;

const CUE_SYSTEM = [
  'You are the Synapse coach — a calm, precise strength coach speaking through a HUD.',
  'You see the lifter only as joint angles and rule deviations provided to you; you never guess about anything you cannot see.',
  'Rephrase the given correction for the lifter mid-set: at most 8 words, imperative, calm.',
  'Never invent numbers, reps, or praise. No exclamation marks. Output the cue text only.',
].join(' ');

const REPORT_SYSTEM = [
  'You are the Synapse coach — a calm, precise strength coach speaking through a HUD.',
  'Write the end-of-set debrief from the measurement JSON provided. One short paragraph, then exactly one sentence naming the single most important fix.',
  'Every claim must be traceable to a number or verdict in the data; if a value is null or noData, say the data was not measured rather than guessing.',
  'Safety stops outrank everything — mention them first if present. No exclamation marks. No greetings. Plain text only.',
].join(' ');

interface AnthropicLike {
  messages: {
    create(params: Record<string, unknown>, opts?: Record<string, unknown>): Promise<{
      content: { type: string; text?: string }[];
      stop_reason: string | null;
    }>;
  };
}

export class LLMCoach implements Coach {
  readonly id = 'llm';
  private rules = new RuleCoach();
  private client: AnthropicLike | null = null;
  private clientFactory: () => Promise<AnthropicLike>;
  private emit: (cue: CoachCue) => void;
  private ex: ExerciseSpec | null = null;
  private inflight = 0;

  constructor(opts: {
    apiKey?: string;
    /** async cues (LLM phrasing) surface through here */
    onCue: (cue: CoachCue) => void;
    /** test seam */
    client?: AnthropicLike;
    now?: () => number;
  }) {
    this.emit = opts.onCue;
    if (opts.client) {
      this.client = opts.client;
      this.clientFactory = async () => opts.client!;
    } else {
      const key = opts.apiKey ?? '';
      this.clientFactory = async () => {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        return new Anthropic({
          apiKey: key,
          dangerouslyAllowBrowser: true, // user's own key, user's own device
          maxRetries: 0, // a late cue is worse than no cue
          timeout: REPORT_TIMEOUT_MS,
        }) as unknown as AnthropicLike;
      };
    }
  }

  setStart(ex: ExerciseSpec): void {
    this.ex = ex;
    this.rules.setStart(ex);
  }

  /**
   * Eligibility and rate-limiting are RuleCoach's, verbatim. When a breakpoint
   * fires we return null (nothing speaks yet) and race Claude against the
   * deadline; whichever phrasing wins is emitted through onCue.
   */
  liveGrade(grade: FrameGrade, now: number): CoachCue | null {
    const deterministic = this.rules.liveGrade(grade, now);
    if (!deterministic) return null;
    this.refineAsync(deterministic, {
      kind: 'live_fault',
      rule: deterministic.ruleId,
      cue: deterministic.text,
      value: this.evalValue(grade, deterministic.ruleId),
    });
    return null;
  }

  repComplete(rep: RepRecord, now: number): CoachCue | null {
    const deterministic = this.rules.repComplete(rep, now);
    if (!deterministic) return null;
    this.refineAsync(deterministic, {
      kind: 'rep_fault',
      rep: rep.index,
      rule: deterministic.ruleId,
      cue: deterministic.text,
      worst: rep.worstRule?.name ?? null,
    });
    return null;
  }

  /** Safety never waits on a network. Deterministic, instant, verbatim. */
  safetyAlert(alert: SafetyAlert, now: number): CoachCue {
    return this.rules.safetyAlert(alert, now);
  }

  async setSummary(s: SetSummary): Promise<{ text: string; source: 'rules' | 'llm' }> {
    const fallback = buildRuleSummary(s);
    try {
      const client = await this.getClient();
      const payload = {
        exercise: s.exerciseName,
        reps: s.reps,
        cleanReps: s.cleanReps,
        techniqueScore: s.techniqueScore,
        tempoAdherence: s.tempoAdherence,
        symmetryPct: s.symmetryAvg === null ? null : Math.round(s.symmetryAvg),
        safetyStops: s.safetyAlerts,
        durationSec: s.durationSec,
        dataSource: s.dataSource,
        rules: s.ruleResults.map((r) => ({
          name: r.name,
          noData: r.noData,
          worstSeverityPct: Math.round(Math.min(1, r.worst) * 100),
          brokeOnReps: r.failedReps,
          fixCue: r.fixCue,
        })),
      };
      const res = await client.messages.create({
        model: REPORT_MODEL,
        max_tokens: 400,
        thinking: { type: 'disabled' }, // short narration task; deterministic latency
        system: REPORT_SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Set measurements:\n${JSON.stringify(payload)}\n\nWrite the debrief.`,
          },
        ],
      });
      if (res.stop_reason === 'refusal') return { text: fallback, source: 'rules' };
      const text = res.content
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join(' ')
        .replace(/!/g, '.')
        .trim();
      if (text.length < 20) return { text: fallback, source: 'rules' };
      return { text, source: 'llm' };
    } catch (e) {
      console.warn('[synapse] LLM report failed; rule summary used', e);
      return { text: fallback, source: 'rules' };
    }
  }

  /** in-flight LLM calls (test observability) */
  get inflightCalls(): number {
    return this.inflight;
  }

  private async getClient(): Promise<AnthropicLike> {
    if (!this.client) this.client = await this.clientFactory();
    return this.client;
  }

  private evalValue(grade: FrameGrade, ruleId: string | null): number | string | null {
    if (!ruleId) return null;
    const ev = grade.evals.find((e) => e.rule.id === ruleId);
    if (!ev || ev.value === null) return null;
    return typeof ev.value === 'number' ? Math.round(ev.value * 10) / 10 : String(ev.value);
  }

  /**
   * Race Claude against the deadline. Whatever happens, exactly one cue is
   * emitted per breakpoint, and it is never slower than deadline+ε.
   */
  private refineAsync(fallback: CoachCue, context: Record<string, unknown>): void {
    let settled = false;
    const settle = (cue: CoachCue) => {
      if (settled) return;
      settled = true;
      this.emit(cue);
    };
    const deadline = setTimeout(() => settle(fallback), CUE_DEADLINE_MS);

    this.inflight += 1;
    void (async () => {
      try {
        const client = await this.getClient();
        const res = await client.messages.create(
          {
            model: CUE_MODEL,
            max_tokens: 30,
            system: CUE_SYSTEM,
            messages: [
              {
                role: 'user',
                content: `Exercise: ${this.ex?.name ?? 'lift'}. Engine data: ${JSON.stringify(context)}. Rephrase the correction (≤8 words).`,
              },
            ],
          },
          { timeout: CUE_DEADLINE_MS },
        );
        if (res.stop_reason === 'refusal') throw new Error('refused');
        const raw = res.content
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text)
          .join(' ')
          .replace(/["!\n]/g, '')
          .trim();
        // the 8-word wall is a deal-breaker: an over-long cue loses to the deterministic one
        if (raw.length === 0 || raw.split(/\s+/).length > 8) throw new Error('cue out of spec');
        clearTimeout(deadline);
        settle({ ...fallback, text: raw });
      } catch {
        clearTimeout(deadline);
        settle(fallback);
      } finally {
        this.inflight -= 1;
      }
    })();
  }
}
