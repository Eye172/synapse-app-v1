import { EXERCISES } from '@/src/data/exercises';
import { AlertTracker, gradeFrame } from '@/src/engine/ruleEngine';
import type { SetSummary } from '@/src/engine/setSession';
import { EMPTY_METRICS, type JointMetrics } from '@/src/engine/types';

import { LLMCoach } from './LLMCoach';
import type { CoachCue } from './types';

const SQUAT = EXERCISES.find((e) => e.id === 'back_squat')!;

function metrics(p: Partial<Omit<JointMetrics, 't'>>): Omit<JointMetrics, 't'> {
  return { ...EMPTY_METRICS, ...p };
}
function gradeWith(p: Partial<Omit<JointMetrics, 't'>>, t = 0) {
  return gradeFrame(SQUAT, t, metrics(p), new AlertTracker());
}

/** controllable fake Anthropic client */
function fakeClient(behavior: { text?: string; delayMs?: number; fail?: boolean; refuse?: boolean }) {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    client: {
      messages: {
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          if (behavior.delayMs) await new Promise((r) => setTimeout(r, behavior.delayMs));
          if (behavior.fail) throw new Error('boom');
          return {
            content: [{ type: 'text', text: behavior.text ?? 'Push the knees outward now' }],
            stop_reason: behavior.refuse ? 'refusal' : 'end_turn',
          };
        },
      },
    },
  };
}

const SUMMARY: SetSummary = {
  exerciseId: 'back_squat',
  exerciseName: 'Back Squat',
  startedAt: 0,
  endedAt: 60000,
  durationSec: 60,
  reps: 5,
  cleanReps: 4,
  techniqueScore: 78,
  tempoAdherence: 85,
  symmetryAvg: 96,
  safetyAlerts: 1,
  dataSource: 'sim',
  repRecords: [],
  ruleResults: [
    { ruleId: 'knee_tracking', name: 'Knee tracking', worst: 1, failedReps: [3], noData: false, fixCue: 'Knees out.', risk: 'knee' },
    { ruleId: 'depth', name: 'Depth', worst: 0, failedReps: [], noData: true, fixCue: 'Hit depth.', risk: null },
  ],
};

describe('LLMCoach — Claude narrates, the engine grades (§2.8)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('emits the LLM phrasing for an eligible breakpoint, within spec', async () => {
    const { client, calls } = fakeClient({ text: 'Drive both knees out wide' });
    const cues: CoachCue[] = [];
    const coach = new LLMCoach({ client, onCue: (c) => cues.push(c) });
    coach.setStart(SQUAT);

    const immediate = coach.liveGrade(gradeWith({ kneeValgus: 22 }), 0);
    expect(immediate).toBeNull(); // nothing speaks synchronously
    await jest.advanceTimersByTimeAsync(50);

    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe('Drive both knees out wide');
    expect(cues[0]!.ruleId).toBe('knee_tracking');
    expect(cues[0]!.text.split(/\s+/).length).toBeLessThanOrEqual(8);
    // the LLM saw only engine data
    const sent = JSON.stringify(calls[0]);
    expect(sent).toContain('knee_tracking');
    expect(sent).not.toContain('landmark');
  });

  it('falls back to the deterministic cue when Claude is slower than the deadline', async () => {
    const { client } = fakeClient({ text: 'Too late anyway', delayMs: 60000 });
    const cues: CoachCue[] = [];
    const coach = new LLMCoach({ client, onCue: (c) => cues.push(c) });
    coach.setStart(SQUAT);

    coach.liveGrade(gradeWith({ kneeValgus: 22 }), 0);
    await jest.advanceTimersByTimeAsync(2100);

    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe('Knees out.'); // the seed cue, verbatim
    // late arrival must not double-speak
    await jest.advanceTimersByTimeAsync(60000);
    expect(cues).toHaveLength(1);
  });

  it('falls back on API errors and refusals', async () => {
    for (const behavior of [{ fail: true }, { refuse: true }, { text: 'way way way too long of a cue to pass the wall' }]) {
      const { client } = fakeClient(behavior);
      const cues: CoachCue[] = [];
      const coach = new LLMCoach({ client, onCue: (c) => cues.push(c) });
      coach.setStart(SQUAT);
      coach.liveGrade(gradeWith({ kneeValgus: 22 }), 0);
      await jest.advanceTimersByTimeAsync(2500);
      expect(cues).toHaveLength(1);
      expect(cues[0]!.text).toBe('Knees out.');
    }
  });

  it('keeps RuleCoach rate limits — no per-frame calls', async () => {
    const { client, calls } = fakeClient({ text: 'Knees out wide' });
    const coach = new LLMCoach({ client, onCue: () => {} });
    coach.setStart(SQUAT);

    // 90 graded frames over 3 simulated seconds — same failing rule
    for (let t = 0; t < 3000; t += 33) {
      coach.liveGrade(gradeWith({ kneeValgus: 22 }, t), t);
    }
    await jest.advanceTimersByTimeAsync(100);
    expect(calls.length).toBe(1); // one breakpoint, one call
  });

  it('safety alerts never touch the network', () => {
    const { client, calls } = fakeClient({});
    const coach = new LLMCoach({ client, onCue: () => {} });
    coach.setStart(SQUAT);
    const cue = coach.safetyAlert(
      { ruleId: 'neutral_spine', risk: 'spine', cue: 'Chest up. Stop the round.', at: 0, fromRig: false },
      0,
    );
    expect(cue.text).toBe('Stop. Chest up. Stop the round.');
    expect(cue.haptic).toBe('stop');
    expect(calls).toHaveLength(0);
  });

  it('writes the report from summary data and labels the source', async () => {
    jest.useRealTimers();
    const { client, calls } = fakeClient({
      text: 'Five reps, four clean. Knee tracking broke on rep 3 and raised a safety stop. Tempo held at 85%. One fix: drive the knees out.',
    });
    const coach = new LLMCoach({ client, onCue: () => {} });
    const { text, source } = await coach.setSummary(SUMMARY);
    expect(source).toBe('llm');
    expect(text).toContain('rep 3');
    expect(text).not.toContain('!');
    expect(calls[0]!.model).toBe('claude-sonnet-5');
    const sentContent = (calls[0]!.messages as { content: string }[])[0]!.content;
    expect(sentContent).toContain('"reps":5');
    expect(sentContent).toContain('Knee tracking');
  });

  it('report falls back to the deterministic summary on failure', async () => {
    jest.useRealTimers();
    const { client } = fakeClient({ fail: true });
    const coach = new LLMCoach({ client, onCue: () => {} });
    const { text, source } = await coach.setSummary(SUMMARY);
    expect(source).toBe('rules');
    expect(text).toContain('5 reps, 4 clean.');
  });

  it('uses haiku for cues', async () => {
    const { client, calls } = fakeClient({ text: 'Knees out wide' });
    const coach = new LLMCoach({ client, onCue: () => {} });
    coach.setStart(SQUAT);
    coach.liveGrade(gradeWith({ kneeValgus: 22 }), 0);
    await jest.advanceTimersByTimeAsync(100);
    expect(calls[0]!.model).toBe('claude-haiku-4-5');
    expect(calls[0]!.max_tokens).toBe(30);
  });
});
