/**
 * A worked example of a technique evaluator, end to end.
 *
 * This is not the app's grader and is never installed by the app — the seam
 * in `evaluator.ts` still ships with the stub. It is here as the template for
 * whoever writes the real one: a complete evaluator, fed a full simulated set
 * through the real `SetEngine`, whose findings are then read back off the
 * frames the live screen receives. Copy the class, replace the judgement, keep
 * the test shape.
 *
 * The simulator's default squat script caves both knees in on rep 3 and on
 * no other rep. The Rig mounts one IMU per thigh, so this shows up as each
 * thigh's direction swinging toward the midline: measured on the simulator,
 * the left thigh's lateral component goes from +0.12 to −0.19 and the right's
 * from −0.12 to +0.23 on that rep, and does not move at all on the others.
 */
import { RuleCoach } from '@/src/coach/RuleCoach';
import { EXERCISES } from '@/src/data/exercises';
import type { EngineFrame } from '@/src/engine/setSession';
import { SetEngine } from '@/src/engine/setSession';
import type { RigNodeId, SegmentId } from '@/src/engine/types';
import { SimPoseSource } from '@/src/sources/sim/SimPoseSource';
import { SimSensorSource } from '@/src/sources/sim/SimSensorSource';
import { SimTimeline, defaultFaultScript } from '@/src/sources/sim/simTimeline';

import {
  setTechniqueEvaluator,
  StubEvaluator,
  type SegmentSeverity,
  type TechniqueEvaluator,
  type TechniqueInput,
  type TechniqueVerdict,
} from './evaluator';

/** How far a knee may travel toward the midline, in thigh-direction units, before it counts. */
const TOLERANCE = 0.05;
/** How much further it has to go to be a fault worth stopping for. */
const RANGE = 0.2;

const LEGS: { node: RigNodeId; thigh: SegmentId; shin: SegmentId }[] = [
  { node: 'leftLeg', thigh: 'leftThigh', shin: 'leftShin' },
  { node: 'rightLeg', thigh: 'rightThigh', shin: 'rightShin' },
];

/**
 * Knee tracking from the thigh IMUs.
 *
 * It learns each thigh's resting lateral direction from the first frame of the
 * set rather than assuming a sign, so it works whichever way the body axes
 * happen to point and whatever the wearer's natural stance width is — and
 * `reset()` forgets it, because the engine resets every evaluator when a set
 * starts.
 */
class KneeTrackingExample implements TechniqueEvaluator {
  readonly name = 'example: knee tracking';
  private rest: Partial<Record<RigNodeId, { outward: number; lateral: number }>> = {};

  /** Nothing to judge without the Rig's calibrated body. */
  ready(input: TechniqueInput): boolean {
    return input.rigBody !== null;
  }

  evaluate(input: TechniqueInput): TechniqueVerdict {
    const segments: SegmentSeverity = {};
    let worst: TechniqueVerdict['worst'] = null;

    for (const { node, thigh, shin } of LEGS) {
      const seg = input.rigBody?.segments[node];
      if (!seg) continue; // a thigh that is not reporting is not judged — never guessed
      const lateral = seg.dir.x;
      const rest = (this.rest[node] ??= { outward: Math.sign(lateral) || 1, lateral });
      // how far the knee has travelled toward the midline since the set began
      const inward = (rest.lateral - lateral) * rest.outward;
      const severity = Math.max(0, Math.min(1, (inward - TOLERANCE) / RANGE));
      segments[thigh] = severity;
      segments[shin] = severity;
      if (severity > (worst?.severity ?? 0)) worst = { segment: thigh, label: 'Knee caving in', severity };
    }

    return { segments, worst, computed: true, by: this.name };
  }

  reset(): void {
    this.rest = {};
  }
}

const SQUAT = EXERCISES.find((e) => e.id === 'back_squat')!;

/** Run a whole simulated set through the real engine and keep every frame, tagged with its rep. */
function runSimulatedSet(seconds: number) {
  jest.useFakeTimers();
  jest.setSystemTime(1_000_000);
  const timeline = new SimTimeline(SQUAT, { t0: Date.now(), fault: defaultFaultScript(SQUAT) });
  const frames: { rep: number; frame: EngineFrame }[] = [];

  const engine = new SetEngine(SQUAT, {
    poseSource: new SimPoseSource(timeline, { wobble: 0 }),
    sensorSource: new SimSensorSource(timeline),
    coach: new RuleCoach(),
    events: { onFrame: (f) => frames.push({ rep: timeline.at(f.t).repIndex, frame: f }) },
  });
  engine.start();
  for (let t = 0; t < seconds * 1000; t += 33) jest.advanceTimersByTime(33);
  engine.stop();
  jest.useRealTimers();
  return frames;
}

/** The worst the evaluator said about the knees during each rep. */
function worstKneePerRep(frames: { rep: number; frame: EngineFrame }[]) {
  const out = new Map<number, number>();
  for (const { rep, frame } of frames) {
    const s = frame.technique.segments;
    const v = Math.max(s.leftThigh ?? 0, s.rightThigh ?? 0);
    out.set(rep, Math.max(out.get(rep) ?? 0, v));
  }
  return out;
}

describe('worked example: a knee-tracking evaluator on a simulated squat set', () => {
  afterEach(() => setTechniqueEvaluator(new StubEvaluator()));

  it('finds the knees caving on rep 3, and on no other rep', () => {
    setTechniqueEvaluator(new KneeTrackingExample());
    const perRep = worstKneePerRep(runSimulatedSet(25));

    expect(perRep.get(3)).toBeGreaterThanOrEqual(0.99);
    for (const rep of [1, 2, 4, 5]) expect(perRep.get(rep) ?? 0).toBe(0);
  });

  it('turns the thighs red on the body the live screen draws', () => {
    setTechniqueEvaluator(new KneeTrackingExample());
    const frames = runSimulatedSet(25);
    const faulted = frames.find(({ frame }) => (frame.severity.leftThigh ?? 0) >= 1);
    expect(faulted).toBeDefined();
    expect(faulted!.rep).toBe(3);
  });

  it('puts its finding in the fault chip', () => {
    setTechniqueEvaluator(new KneeTrackingExample());
    const frames = runSimulatedSet(25);
    const labels = new Set(frames.map(({ frame }) => frame.technique.worst?.label).filter(Boolean));
    expect(labels).toEqual(new Set(['Knee caving in']));
  });

  it('is judged on the calibrated rig body, not left to decode quaternions itself', () => {
    let seen: TechniqueInput | null = null;
    setTechniqueEvaluator({
      name: 'spy',
      ready: () => true,
      evaluate: (i) => {
        seen ??= i;
        return { segments: {}, worst: null, computed: true, by: 'spy' };
      },
      reset: () => {},
    });
    runSimulatedSet(2);
    expect(seen).not.toBeNull();
    const body = seen!.rigBody!;
    expect(body.segments.leftLeg?.dir).toBeDefined();
    expect(typeof body.segments.back?.deltaDeg).toBe('number');
  });
});
