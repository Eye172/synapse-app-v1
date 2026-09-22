import type { ExerciseSpec, SegmentId, SensorFrame } from '@/src/engine/types';
import type { TrackedPose } from '@/src/vision/tracker';

/**
 * Where technique gets judged — and the one place it gets judged.
 *
 * This app has two halves that are deliberately kept apart. Everything
 * under src/vision and src/ui answers *where the body is* and draws it.
 * This answers *what is wrong with it*, and it is the half being handed to
 * someone else to build: the rig's quaternions arrive here and per-segment
 * severities leave, and nothing in the renderer knows or cares how the
 * number in between was arrived at.
 *
 * That split is why the interface is this narrow. An evaluator gets the
 * sensor frame, the exercise being performed, and the tracked body for
 * context; it returns a severity per body segment. It cannot reach into the
 * renderer, it cannot hold UI state, and it can be replaced wholesale
 * without touching a line of drawing code.
 *
 * The shipped default is `StubEvaluator`, which computes nothing and says
 * so. That is on purpose: a placeholder that invented plausible-looking
 * severities would be indistinguishable from a working one, and the first
 * person to trust it would be trusting nothing.
 */

/** Severity per body segment: 0 clean, 1 a fault worth stopping for. */
export type SegmentSeverity = Partial<Record<SegmentId, number>>;

export interface TechniqueInput {
  /** frame time, ms */
  t: number;
  /** which lift is being performed, with its rules and tolerances */
  exercise: ExerciseSpec;
  /**
   * The rig's own reading: five absolute orientations, one per mount point,
   * plus whatever the firmware flagged. Null when no rig is linked.
   */
  sensor: SensorFrame | null;
  /**
   * The body as the camera sees it — metric joints, measured proportions,
   * how fast it is moving. Context, not the source of truth: the camera can
   * say a knee is bent, the rig says whether it is bent wrongly.
   */
  pose: TrackedPose | null;
}

export interface TechniqueVerdict {
  /** what to tint, and how hard */
  segments: SegmentSeverity;
  /** the single finding worth showing, if any */
  worst: { segment: SegmentId; label: string; severity: number } | null;
  /**
   * False when this evaluator did not actually compute anything this frame.
   *
   * The renderer uses it to keep the figure neutral rather than reporting a
   * clean lift it never checked. "No opinion" and "no faults" are different
   * answers and the user is entitled to know which one they are getting.
   */
  computed: boolean;
  /** which evaluator produced this, for diagnostics */
  by: string;
}

export interface TechniqueEvaluator {
  readonly name: string;
  /** true when this evaluator can say anything at all right now */
  ready(input: TechniqueInput): boolean;
  evaluate(input: TechniqueInput): TechniqueVerdict;
  reset(): void;
}

export const NO_VERDICT: TechniqueVerdict = {
  segments: {},
  worst: null,
  computed: false,
  by: 'none',
};

/**
 * The handoff point.
 *
 * Replace this class, or register another implementation through
 * `setTechniqueEvaluator`, and the whole app starts grading. Nothing else
 * needs to change: the live screen already colours segments from whatever
 * this returns, and already distinguishes "checked and clean" from "not
 * checked".
 *
 * What arrives here, concretely:
 *
 *   input.sensor.nodes   five entries, ids back / leftArm / rightArm /
 *                        leftLeg / rightLeg, each with an absolute
 *                        orientation quaternion in scalar-first order
 *                        [r, i, j, k], and possibly the firmware's own
 *                        per-node alert flag
 *   input.pose.world     33 metric joints, hips at the origin, y up,
 *                        z toward the camera, already smoothed and held
 *                        to the wearer's measured bone lengths
 *   input.exercise.rules the tolerances declared for this lift
 *
 * What is expected back: a severity per segment, and the one finding worth
 * telling the lifter about. Everything else is presentation and is already
 * built.
 */
export class StubEvaluator implements TechniqueEvaluator {
  readonly name = 'stub';

  ready(): boolean {
    return false;
  }

  evaluate(input: TechniqueInput): TechniqueVerdict {
    // Deliberately empty. The rig's frames are arriving and are visible in
    // diagnostics; turning them into a judgement is the work this seam
    // exists to receive.
    void input;
    return { segments: {}, worst: null, computed: false, by: this.name };
  }

  reset(): void {}
}

let current: TechniqueEvaluator = new StubEvaluator();

/** Install the real evaluator. Called once at startup by whoever has one. */
export function setTechniqueEvaluator(e: TechniqueEvaluator): void {
  current = e;
}

export function techniqueEvaluator(): TechniqueEvaluator {
  return current;
}

/** Judge one frame through whichever evaluator is installed. */
export function evaluateTechnique(input: TechniqueInput): TechniqueVerdict {
  const e = current;
  if (!e.ready(input)) return { ...NO_VERDICT, by: e.name };
  try {
    return e.evaluate(input);
  } catch (err) {
    // a grader that throws must not take the overlay down with it
    console.warn('[synapse] technique evaluator threw', err);
    return { ...NO_VERDICT, by: e.name };
  }
}
