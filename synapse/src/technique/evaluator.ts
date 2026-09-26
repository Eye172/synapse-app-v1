import type { RigBodyState } from '@/src/engine/rigBody';
import { ALL_SEGMENTS, type ExerciseSpec, type SegmentId, type SensorFrame } from '@/src/engine/types';
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
   * The same frame already turned into a body, through the wearer's own
   * calibration: for each node, the unit direction of its segment in body
   * coordinates (x across, y up, z forward) and how far it has rotated from
   * the calibrated neutral stance. This is what the Rig's skeleton is drawn
   * from, so a judgement made on it is about the body the lifter sees. Null
   * when no Rig is linked, or the frame carried no orientation.
   */
  rigBody: RigBodyState | null;
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
 * Register an implementation through `setTechniqueEvaluator` and the whole
 * app starts grading from it. Nothing else needs to change:
 *
 *  - `SetEngine` calls it on every pose frame of a set, with the Rig's latest
 *    frame and the camera's tracked body, and resets it when a set starts;
 *  - its segments are merged with the rule engine's — the worse of the two
 *    wins, per segment — and tint the body turquoise → amber → red;
 *  - its `worst` finding takes the live screen's fault chip whenever it is
 *    more severe than the rule engine's, and a finding at full severity is
 *    marked on the Review timeline.
 *
 * "Checked and clean" and "not checked" stay different answers: while this
 * returns `computed: false`, the rule engine alone decides the colours.
 *
 * What arrives here, concretely:
 *
 *   input.sensor.nodes   five entries, ids back / leftArm / rightArm /
 *                        leftLeg / rightLeg, each with an absolute
 *                        orientation quaternion in scalar-first order
 *                        [r, i, j, k], and possibly the firmware's own
 *                        per-node alert flag; a node with no usable
 *                        reading carries `fault` instead of `quat`
 *   input.rigBody        those five, calibrated: segment direction in body
 *                        coordinates and degrees from neutral
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

/** Judge one frame through whichever evaluator is installed. Never throws. */
export function evaluateTechnique(input: TechniqueInput): TechniqueVerdict {
  const e = current;
  try {
    if (!e.ready(input)) return { ...NO_VERDICT, by: e.name };
    return sanitizeVerdict(e.evaluate(input), e.name);
  } catch (err) {
    // a grader that throws must not take the overlay down with it
    console.warn('[synapse] technique evaluator threw', err);
    return { ...NO_VERDICT, by: e.name };
  }
}

/** Every segment the renderer knows, so a verdict cannot tint one that does not exist. */
const KNOWN_SEGMENTS = new Set<SegmentId>(ALL_SEGMENTS);

function severityOf(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(1, v));
}

/**
 * Hold a verdict to its contract before anything downstream sees it.
 *
 * The evaluator is someone else's code running thirty times a second inside
 * the live screen. A NaN would turn a segment's colour into garbage, a
 * severity of 7 would read as a fault no rule could produce, and a typo in a
 * segment id would tint nothing and say nothing. Severities are clamped to
 * 0…1, anything unknown or non-finite is dropped, and a finding with no
 * usable label is not shown — so a bug in grading degrades to "less said",
 * never to a wrong picture.
 */
export function sanitizeVerdict(v: TechniqueVerdict | null | undefined, by = 'unknown'): TechniqueVerdict {
  if (!v || typeof v !== 'object') return { ...NO_VERDICT, by };
  const segments: SegmentSeverity = {};
  if (v.segments && typeof v.segments === 'object') {
    for (const [id, raw] of Object.entries(v.segments)) {
      const sev = severityOf(raw);
      if (sev !== null && KNOWN_SEGMENTS.has(id as SegmentId)) segments[id as SegmentId] = sev;
    }
  }
  let worst: TechniqueVerdict['worst'] = null;
  if (v.worst && typeof v.worst === 'object') {
    const sev = severityOf(v.worst.severity);
    const label = typeof v.worst.label === 'string' ? v.worst.label.trim() : '';
    if (sev !== null && label && KNOWN_SEGMENTS.has(v.worst.segment)) {
      worst = { segment: v.worst.segment, label, severity: sev };
    }
  }
  return {
    segments,
    worst,
    computed: v.computed === true,
    by: typeof v.by === 'string' && v.by ? v.by : by,
  };
}

/**
 * What the body is tinted with: the rule engine's severities and the
 * evaluator's, the worse of the two on each segment. A verdict that was not
 * computed contributes nothing — the rule engine alone decides, as before.
 */
export function mergeSeverity(rules: SegmentSeverity, verdict: TechniqueVerdict): SegmentSeverity {
  if (!verdict.computed) return rules;
  const out: SegmentSeverity = { ...rules };
  for (const [id, sev] of Object.entries(verdict.segments) as [SegmentId, number][]) {
    out[id] = Math.max(out[id] ?? 0, sev);
  }
  return out;
}
