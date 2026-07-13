import type { FrameGrade, SafetyAlert } from '@/src/engine/ruleEngine';
import type { RepRecord, SetSummary } from '@/src/engine/setSession';
import type { ExerciseSpec } from '@/src/engine/types';

import type { Coach, CoachCue } from './types';

const LIVE_CUE_GAP_MS = 4000; // ≤1 in-set cue per 4s (§2.8)
const SAME_RULE_GAP_MS = 9000;
const LIVE_SEVERITY_FLOOR = 0.55;

/**
 * The always-on deterministic coach. Every word traces to a rule the engine
 * fired — it cannot fabricate (deal-breaker 2). Terse, calm, no exclamation
 * marks: it respects that the user is under a loaded barbell.
 */
export class RuleCoach implements Coach {
  readonly id = 'rules';
  private lastCueAt = -Infinity;
  private lastRuleAt = new Map<string, { at: number; severity: number }>();
  private ex: ExerciseSpec | null = null;

  setStart(ex: ExerciseSpec): void {
    this.ex = ex;
    this.lastCueAt = -Infinity;
    this.lastRuleAt.clear();
  }

  liveGrade(grade: FrameGrade, now: number): CoachCue | null {
    const worst = grade.worstLive;
    if (!worst || worst.severity === null || worst.severity < LIVE_SEVERITY_FLOOR) return null;
    if (now - this.lastCueAt < LIVE_CUE_GAP_MS) return null;

    const prev = this.lastRuleAt.get(worst.rule.id);
    const escalated = prev !== undefined && prev.severity < 1 && worst.severity >= 1;
    if (prev && now - prev.at < SAME_RULE_GAP_MS && !escalated) return null;

    this.lastCueAt = now;
    this.lastRuleAt.set(worst.rule.id, { at: now, severity: worst.severity });
    return {
      text: worst.rule.cue,
      ruleId: worst.rule.id,
      kind: 'correction',
      speak: true,
      haptic: worst.severity >= 1 ? 'fault' : 'minor',
      at: now,
    };
  }

  repComplete(rep: RepRecord, now: number): CoachCue | null {
    if (rep.clean) return null;
    if (now - this.lastCueAt < LIVE_CUE_GAP_MS) return null;
    const worst = rep.worstRule;
    if (!worst) return null;
    this.lastCueAt = now;
    return {
      text: worst.cue,
      ruleId: worst.id,
      kind: 'rep',
      speak: true,
      haptic: 'minor',
      at: now,
    };
  }

  safetyAlert(alert: SafetyAlert, now: number): CoachCue {
    this.lastCueAt = now;
    return {
      text: `Stop. ${alert.cue}`,
      ruleId: alert.ruleId,
      kind: 'safety',
      speak: true,
      haptic: 'stop',
      at: now,
    };
  }

  async setSummary(s: SetSummary): Promise<{ text: string; source: 'rules' | 'llm' }> {
    return { text: buildRuleSummary(s), source: 'rules' };
  }
}

/** Deterministic written summary — every clause traceable to the data. */
export function buildRuleSummary(s: SetSummary): string {
  const parts: string[] = [];
  if (s.reps === 0) {
    parts.push('No completed reps registered this set.');
  } else {
    parts.push(`${s.reps} rep${s.reps === 1 ? '' : 's'}, ${s.cleanReps} clean.`);
  }

  const failed = s.ruleResults
    .filter((r) => !r.noData && r.failedReps.length > 0)
    .sort((a, b) => b.failedReps.length - a.failedReps.length);
  const worst = failed[0];
  if (worst) {
    parts.push(
      `${worst.name} broke on rep${worst.failedReps.length === 1 ? '' : 's'} ${worst.failedReps.join(', ')}.`,
    );
  } else if (s.reps > 0) {
    parts.push('No rule crossed its error line.');
  }

  if (s.tempoAdherence !== null && s.reps > 0) {
    parts.push(`Tempo adherence ${s.tempoAdherence}%.`);
  }
  if (s.symmetryAvg !== null) {
    parts.push(`Symmetry ${Math.round(s.symmetryAvg)}%.`);
  }
  if (s.safetyAlerts > 0) {
    parts.push(`${s.safetyAlerts} safety stop${s.safetyAlerts === 1 ? '' : 's'} raised.`);
  }

  const noData = s.ruleResults.filter((r) => r.noData);
  if (noData.length > 0) {
    parts.push(`No data for ${noData.map((r) => r.name.toLowerCase()).join(', ')} with the current sources.`);
  }

  if (worst) {
    parts.push(`One fix: ${worst.fixCue.toLowerCase().replace(/\.$/, '')} before the next set.`);
  } else if (s.reps > 0) {
    parts.push('Keep the same standard next set.');
  }
  return parts.join(' ');
}
