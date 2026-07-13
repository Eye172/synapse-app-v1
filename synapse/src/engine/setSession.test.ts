import { RuleCoach } from '@/src/coach/RuleCoach';
import type { CoachCue } from '@/src/coach/types';
import { EXERCISES } from '@/src/data/exercises';
import { SimPoseSource } from '@/src/sources/sim/SimPoseSource';
import { SimSensorSource } from '@/src/sources/sim/SimSensorSource';
import { SimTimeline, defaultFaultScript } from '@/src/sources/sim/simTimeline';

import type { SafetyAlert } from './ruleEngine';
import { SetEngine, type RepRecord } from './setSession';

const SQUAT = EXERCISES.find((e) => e.id === 'back_squat')!;
const DEADLIFT = EXERCISES.find((e) => e.id === 'deadlift')!;

/**
 * The PASS-1 proof: the whole pipeline — sim sources → metrics → fusion →
 * grading → reps → coach — run headlessly through a five-rep set with the
 * deterministic fault injector armed for rep 3 (§2.10).
 */
function runSet(ex: typeof SQUAT, opts: { fault: boolean; seconds: number }) {
  jest.useFakeTimers();
  jest.setSystemTime(1_000_000);

  const timeline = new SimTimeline(ex, {
    t0: Date.now(),
    fault: opts.fault ? defaultFaultScript(ex) : { kind: 'none', reps: [], intensity: 0 },
  });
  const pose = new SimPoseSource(timeline, { wobble: 0 });
  const rig = new SimSensorSource(timeline);

  const reps: RepRecord[] = [];
  const cues: CoachCue[] = [];
  const alerts: SafetyAlert[] = [];

  const engine = new SetEngine(ex, {
    poseSource: pose,
    sensorSource: rig,
    coach: new RuleCoach(),
    events: {
      onRep: (r) => reps.push(r),
      onCue: (c) => cues.push(c),
      onAlert: (a) => {
        if (a) alerts.push(a);
      },
    },
  });

  engine.start();
  const stepMs = 33;
  for (let t = 0; t < opts.seconds * 1000; t += stepMs) {
    jest.advanceTimersByTime(stepMs);
  }
  engine.stop();
  const summary = engine.getSummary();
  jest.useRealTimers();
  return { reps, cues, alerts, summary };
}

describe('SetEngine — full demo-mode set, headless', () => {
  it('a clean squat set counts every rep and stays green', () => {
    const { reps, alerts, summary } = runSet(SQUAT, { fault: false, seconds: 30 });
    expect(reps.length).toBeGreaterThanOrEqual(4);
    expect(summary.reps).toBe(reps.length);
    expect(summary.cleanReps).toBe(summary.reps);
    expect(alerts).toHaveLength(0);
    expect(summary.techniqueScore).toBeGreaterThanOrEqual(90);
    // sim sensor + sim pose must label honestly as sim — never "rig"
    expect(summary.dataSource).toBe('sim');
    // depth judged per rep and passing
    const depth = summary.ruleResults.find((r) => r.ruleId === 'depth')!;
    expect(depth.noData).toBe(false);
    expect(depth.failedReps).toHaveLength(0);
  }, 30000);

  it('the injected fault dirties rep 3, tints the knees, raises the knee alert and speaks the cue', () => {
    const { reps, cues, alerts, summary } = runSet(SQUAT, { fault: true, seconds: 30 });
    expect(reps.length).toBeGreaterThanOrEqual(4);

    const rep3 = reps.find((r) => r.index === 3)!;
    expect(rep3.clean).toBe(false);
    expect(rep3.frameWorst.knee_tracking).toBeGreaterThanOrEqual(1);

    const otherReps = reps.filter((r) => r.index !== 3);
    expect(otherReps.every((r) => r.clean)).toBe(true);

    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0]!.risk).toBe('knee');

    expect(cues.some((c) => c.text.includes('Knees out'))).toBe(true);
    expect(cues.some((c) => c.kind === 'safety' && c.text.startsWith('Stop.'))).toBe(true);

    const valgus = summary.ruleResults.find((r) => r.ruleId === 'knee_tracking')!;
    expect(valgus.failedReps).toContain(3);
    expect(summary.techniqueScore).toBeLessThan(95);
    expect(summary.cleanReps).toBe(summary.reps - 1);
  }, 30000);

  it('deadlift spine rounding drops the Rig spine angle and flags the firmware-style alert', () => {
    const { cues, alerts, summary } = runSet(DEADLIFT, { fault: true, seconds: 30 });
    const spine = summary.ruleResults.find((r) => r.ruleId === 'neutral_spine')!;
    expect(spine.failedReps).toContain(3);
    expect(alerts.some((a) => a.risk === 'spine')).toBe(true);
    expect(cues.some((c) => c.text.includes('Flat back'))).toBe(true);
  }, 30000);

  it('the summary written by RuleCoach traces to the data', async () => {
    const { summary } = runSet(SQUAT, { fault: true, seconds: 30 });
    const coach = new RuleCoach();
    const { text, source } = await coach.setSummary(summary);
    expect(source).toBe('rules');
    expect(text).toContain(`${summary.reps} reps`);
    expect(text).toContain('3');
  }, 30000);
});
