import type { RigNodeId, SegmentId } from '@/src/engine/types';

import type { SegmentSeverity, TechniqueFinding, TechniqueVerdict } from './evaluator';

/**
 * Ready-made commands for lighting up the 3D body.
 *
 * An evaluator's job is to decide *what* is wrong; saying it to the renderer
 * should take one line. These helpers build the `TechniqueVerdict` the seam
 * expects from plain statements:
 *
 *   return highlight('my evaluator')
 *     .fault('leftLeg', 'Knee caving in', { cue: 'Knees out' })  // red, chip, spoken, Review mark
 *     .drift('torso', 'Chest dropping')                          // amber, chip, spoken
 *     .mark('rightShin', 0.3)                                    // a light tint, nothing said
 *     .verdict();
 *
 * What each level does on screen (the thresholds the live screen uses):
 *
 *   CLEAN  0      turquoise — the part was checked and is fine
 *   WATCH  0.3    tinted toward amber, nothing said
 *   DRIFT  0.55   amber; shown in the fault chip and spoken
 *   FAULT  1      red; shown, spoken with a hard buzz, marked on the Review timeline
 *
 * Any number in between is allowed and the colour follows it continuously.
 * Several marks on one segment keep the worst. The finding shown is the most
 * severe mark that carries a label.
 */

export const SEVERITY = {
  CLEAN: 0,
  WATCH: 0.3,
  DRIFT: 0.55,
  FAULT: 1,
} as const;

/**
 * Named groups of the renderer's segments, so a judgement about "the left
 * leg" does not have to know the mannequin is built from a thigh and a shin.
 */
export const BODY_PARTS = {
  head: ['head', 'neck'],
  spine: ['neck', 'torso', 'hips'],
  trunk: ['torso', 'hips'],
  leftArm: ['leftArm', 'leftForearm'],
  rightArm: ['rightArm', 'rightForearm'],
  arms: ['leftArm', 'leftForearm', 'rightArm', 'rightForearm'],
  leftLeg: ['leftThigh', 'leftShin'],
  rightLeg: ['rightThigh', 'rightShin'],
  legs: ['leftThigh', 'leftShin', 'rightThigh', 'rightShin'],
  all: [
    'head', 'neck', 'torso', 'hips',
    'leftArm', 'rightArm', 'leftForearm', 'rightForearm',
    'leftThigh', 'rightThigh', 'leftShin', 'rightShin',
  ],
} as const satisfies Record<string, readonly SegmentId[]>;

export type BodyPart = keyof typeof BODY_PARTS;

/**
 * The segments each Rig sensor actually measures. The Rig has one IMU per
 * limb, on the upper segment; the lower one (forearm, shin) is inferred. A
 * judgement from a sensor tints what that sensor sees — use `BODY_PARTS`
 * when the finding is about the whole limb.
 */
export const SEGMENTS_OF_NODE: Record<RigNodeId, readonly SegmentId[]> = {
  back: ['neck', 'torso', 'hips'],
  leftArm: ['leftArm'],
  rightArm: ['rightArm'],
  leftLeg: ['leftThigh'],
  rightLeg: ['rightThigh'],
};

/** A segment, a named body part, or a list of either. */
export type Target = SegmentId | BodyPart | readonly (SegmentId | BodyPart)[];

function segmentsOf(target: Target): SegmentId[] {
  const list = (Array.isArray(target) ? target : [target]) as (SegmentId | BodyPart)[];
  const out = new Set<SegmentId>();
  for (const t of list) {
    const group = (BODY_PARTS as Record<string, readonly SegmentId[]>)[t];
    if (group) group.forEach((s) => out.add(s));
    else out.add(t as SegmentId);
  }
  return [...out];
}

export class Highlight {
  private segments: SegmentSeverity = {};
  private finding: TechniqueFinding | null = null;

  constructor(private readonly by: string) {}

  /**
   * Tint a target at any severity 0…1. With a label, it may become the
   * finding shown in the fault chip (the most severe labelled mark wins).
   */
  mark(target: Target, severity: number, label?: string, opts: { cue?: string } = {}): this {
    const sev = Math.max(0, Math.min(1, Number.isFinite(severity) ? severity : 0));
    const segs = segmentsOf(target);
    for (const s of segs) this.segments[s] = Math.max(this.segments[s] ?? 0, sev);
    if (label && segs.length > 0 && (this.finding === null || sev > this.finding.severity)) {
      this.finding = { segment: segs[0]!, label, severity: sev, ...(opts.cue ? { cue: opts.cue } : {}) };
    }
    return this;
  }

  /** Red: shown, spoken with a hard buzz, marked on the Review timeline. */
  fault(target: Target, label: string, opts?: { cue?: string }): this {
    return this.mark(target, SEVERITY.FAULT, label, opts);
  }

  /** Amber: shown in the fault chip and spoken. */
  drift(target: Target, label: string, opts?: { cue?: string }): this {
    return this.mark(target, SEVERITY.DRIFT, label, opts);
  }

  /** A light tint toward amber, nothing said — "keep an eye on this". */
  watch(target: Target): this {
    return this.mark(target, SEVERITY.WATCH);
  }

  /**
   * Checked and fine. Explicitly clean segments are part of the verdict, so
   * the screen knows they were looked at — distinct from not checked.
   */
  clean(target: Target): this {
    return this.mark(target, SEVERITY.CLEAN);
  }

  /**
   * Scale a measured error onto severity: at or below `ok` it is clean, at
   * `fault` or beyond it is a fault, linear in between. For example a knee
   * travelling 0.05 inward is fine and 0.25 is a fault:
   *
   *   .measure('leftLeg', inward, { ok: 0.05, fault: 0.25 }, 'Knee caving in')
   */
  measure(target: Target, value: number, range: { ok: number; fault: number }, label?: string, opts?: { cue?: string }): this {
    const span = range.fault - range.ok;
    const sev = span === 0 ? (value >= range.fault ? 1 : 0) : (value - range.ok) / span;
    return this.mark(target, sev, sev > 0 ? label : undefined, opts);
  }

  /** The verdict to return from `evaluate()`. */
  verdict(): TechniqueVerdict {
    return { segments: { ...this.segments }, worst: this.finding, computed: true, by: this.by };
  }
}

/** Start a verdict. Everything marked on it is what the body shows. */
export function highlight(by: string): Highlight {
  return new Highlight(by);
}

/**
 * "I could not judge this frame" — the body stays as the rule engine left it.
 * Different from `highlight(by).verdict()` with nothing marked, which says
 * "judged, and nothing is wrong".
 */
export function notChecked(by: string): TechniqueVerdict {
  return { segments: {}, worst: null, computed: false, by };
}
