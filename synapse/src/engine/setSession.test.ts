import { RuleCoach } from '@/src/coach/RuleCoach';
import type { CoachCue } from '@/src/coach/types';
import { EXERCISES } from '@/src/data/exercises';
import { SimPoseSource } from '@/src/sources/sim/SimPoseSource';
import { SimSensorSource } from '@/src/sources/sim/SimSensorSource';
import { SimTimeline, defaultFaultScript } from '@/src/sources/sim/simTimeline';

import { setTechniqueEvaluator, StubEvaluator, type TechniqueInput } from '@/src/technique/evaluator';
import type { TrackedPose } from '@/src/vision/tracker';

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

/**
 * The unit fix is only worth anything if the engine applies it. This drives a
 * single camera frame through the whole set pipeline — the way a phone would —
 * and reads the lean back off the frame the live screen receives.
 */
describe('SetEngine — a camera pose is graded in one unit', () => {
  function cameraLean(leanDeg: number) {
    const W = 720;
    const H = 1280;
    const px = (x: number, y: number) => ({ x: x / W, y: y / H, v: 1 });
    const len = 420;
    const rad = (leanDeg * Math.PI) / 180;
    const hip = { x: 360, y: 900 };
    const shoulder = { x: hip.x + len * Math.sin(rad), y: hip.y - len * Math.cos(rad) };
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0, y: 0, v: 0 }));
    // a side-on body, so the lean is measurable from the picture alone
    landmarks[11] = px(shoulder.x, shoulder.y);
    landmarks[12] = px(shoulder.x + 1, shoulder.y);
    landmarks[23] = px(hip.x, hip.y);
    landmarks[24] = px(hip.x + 1, hip.y);
    return { landmarks, frame: { width: W, height: H } };
  }

  function torsoLeanFrom(pose: { landmarks: { x: number; y: number; v: number }[]; frame: { width: number; height: number } }) {
    let emit: ((f: unknown) => void) | null = null;
    const source = {
      kind: 'camera' as const,
      status: 'active' as const,
      start() {},
      stop() {},
      onPose(cb: (f: unknown) => void) {
        emit = cb;
        return () => {};
      },
      onStatus() {
        return () => {};
      },
    };
    const leans: (number | null)[] = [];
    const engine = new SetEngine(SQUAT, {
      poseSource: source as never,
      sensorSource: null,
      coach: new RuleCoach(),
      events: { onFrame: (f) => leans.push(f.metrics.torsoLean ?? null) },
    });
    engine.start();
    emit!({ t: Date.now(), source: 'camera', landmarks: pose.landmarks, frame: pose.frame });
    engine.stop();
    return leans[0] ?? null;
  }

  it('reads a 30° lean as 30°, not the ~46° per-axis normalization would give', () => {
    const lean = torsoLeanFrom(cameraLean(30));
    expect(lean).not.toBeNull();
    expect(lean!).toBeCloseTo(30, 0);
  });

  it('reads an upright torso as upright', () => {
    expect(torsoLeanFrom(cameraLean(0))!).toBeCloseTo(0, 0);
  });
});

/**
 * The technique evaluator is the part another developer writes. This is the
 * proof that what they return reaches the lifter: through the engine, onto
 * the body, into the fault chip — with the Rig's frame and the camera's body
 * as their input. Before this test existed the evaluator was exported and
 * called by nothing, and its output would have gone nowhere.
 */
describe('SetEngine — the technique evaluator is actually wired in', () => {
  afterEach(() => setTechniqueEvaluator(new StubEvaluator()));

  function harness(trackedPose: TrackedPose | null = null) {
    let emitPose: ((f: unknown) => void) | null = null;
    let emitSensor: ((f: unknown) => void) | null = null;
    const pose = {
      kind: 'rig' as const,
      status: 'active' as const,
      start() {},
      stop() {},
      onPose(cb: (f: unknown) => void) {
        emitPose = cb;
        return () => {};
      },
      onStatus() {
        return () => {};
      },
    };
    const sensor = {
      kind: 'udp' as const,
      status: 'active' as const,
      start() {},
      stop() {},
      onFrame(cb: (f: unknown) => void) {
        emitSensor = cb;
        return () => {};
      },
      onStatus() {
        return () => {};
      },
    };
    const frames: { severity: Record<string, number>; technique: { computed: boolean; worst: unknown } }[] = [];
    const engine = new SetEngine(SQUAT, {
      poseSource: pose as never,
      sensorSource: sensor as never,
      ownsSensor: false,
      coach: new RuleCoach(),
      trackedPose: () => trackedPose,
      events: { onFrame: (f) => frames.push(f as never) },
    });
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, v: 1 }));
    const rigFrame = {
      t: 1,
      protocol: 'v2-packed',
      flags: {},
      nodes: [{ id: 'back', quat: [1, 0, 0, 0] }],
    };
    return {
      engine,
      frames,
      rigFrame,
      sendSensor: () => emitSensor!(rigFrame),
      sendPose: () => emitPose!({ t: Date.now(), source: 'rig', landmarks }),
    };
  }

  it('tints the body and raises the finding from what the evaluator returns', () => {
    setTechniqueEvaluator({
      name: 'handoff-test',
      ready: () => true,
      evaluate: () => ({
        segments: { leftThigh: 1 },
        worst: { segment: 'leftThigh', label: 'Knee caving in', severity: 1 },
        computed: true,
        by: 'handoff-test',
      }),
      reset: () => {},
    });
    const h = harness();
    h.engine.start();
    h.sendPose();
    h.engine.stop();

    const f = h.frames[0]!;
    expect(f.technique.computed).toBe(true);
    expect(f.severity.leftThigh).toBe(1);
    expect(f.technique.worst).toEqual({ segment: 'leftThigh', label: 'Knee caving in', severity: 1 });
  });

  it('hands the evaluator the Rig frame and the camera body it is meant to judge', () => {
    const seen: TechniqueInput[] = [];
    setTechniqueEvaluator({
      name: 'spy',
      ready: () => true,
      evaluate: (i) => {
        seen.push(i);
        return { segments: {}, worst: null, computed: true, by: 'spy' };
      },
      reset: () => {},
    });
    const body = { t: 1, coverage: 1 } as unknown as TrackedPose;
    const h = harness(body);
    h.engine.start();
    h.sendSensor();
    h.sendPose();
    h.engine.stop();

    expect(seen).toHaveLength(1);
    expect(seen[0]!.sensor).toBe(h.rigFrame);
    expect(seen[0]!.pose).toBe(body);
    expect(seen[0]!.exercise.id).toBe(SQUAT.id);
  });

  it('starts every set with a fresh evaluator', () => {
    const reset = jest.fn();
    setTechniqueEvaluator({ name: 'r', ready: () => false, evaluate: () => ({ segments: {}, worst: null, computed: false, by: 'r' }), reset });
    const h = harness();
    h.engine.start();
    h.engine.stop();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('changes nothing while the stub is installed: the rule engine alone colours the body', () => {
    const h = harness();
    h.engine.start();
    h.sendPose();
    h.engine.stop();
    const f = h.frames[0]! as unknown as { severity: unknown; grade: { segments: unknown }; technique: { computed: boolean } };
    expect(f.technique.computed).toBe(false);
    expect(f.severity).toBe(f.grade.segments);
  });
});
