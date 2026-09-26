import type { RigBodyState } from '@/src/engine/rigBody';
import { ALL_SEGMENTS, type ExerciseSpec, type SegmentId, type SensorFrame } from '@/src/engine/types';

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
 * Rig's frame and the exercise being performed — the Rig alone judges; the
 * camera never reaches this file. It returns a severity per body segment,
 * and the renderer paints those onto whatever body is on screen: the
 * exoskeleton over the camera picture, or the Rig's own figure. It cannot reach into the
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
}

/** The one finding worth telling the lifter about. */
export interface TechniqueFinding {
  /** which part of the body it is about — that segment is where the chip points */
  segment: SegmentId;
  /** what is wrong, shown in the fault chip and on the Review timeline: "Knee caving in" */
  label: string;
  /** 0…1. From 0.55 it is shown and spoken (DRIFT); at 1 it is a FAULT, marked for Review */
  severity: number;
  /**
   * What to say out loud: a short instruction, a few words ("Knees out").
   * Optional; without it the label is spoken.
   */
  cue?: string;
}

export interface TechniqueVerdict {
  /** what to tint, and how hard */
  segments: SegmentSeverity;
  /** the single finding worth showing, if any */
  worst: TechniqueFinding | null;
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
 *  - `SetEngine` calls it on every frame of a set with the Rig's latest
 *    frame, and resets it when a set starts;
 *  - its segments are merged with the rule engine's — the worse of the two
 *    wins, per segment — and tint the body turquoise → amber → red;
 *  - its `worst` finding takes the live screen's fault chip whenever it is
 *    more severe than the rule engine's, is spoken (its `cue`, or its label)
 *    with a vibration through the same rate-limited coach that speaks the
 *    rule engine's corrections, and at full severity is marked on the Review
 *    timeline.
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
      const cue = typeof v.worst.cue === 'string' ? v.worst.cue.trim() : '';
      if (cue) worst.cue = cue;
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
