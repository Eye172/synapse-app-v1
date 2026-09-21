import { LM, type Landmark, type SegmentId } from '@/src/engine/types';

import { limbBox, type P3, type Quad } from './volume';

/**
 * The body, as a list of solids.
 *
 * Kept out of the renderer so the shape of the figure can be checked without
 * a canvas: whether it lands on screen at a sensible size, whether the hips
 * sit below the shoulders, whether a segment the hardware cannot see is
 * marked as such. Those are the failures that would otherwise only show up on
 * somebody else's phone.
 */

/** Body units per normalized landmark unit — sized so the figure fills the frame. */
export const BODY_SCALE = 2.0;

/** Visibility below this and the landmark is not worth drawing. */
const VIS = 0.15;

export interface BodyVolume {
  segment: SegmentId;
  quads: Quad[];
  /**
   * True when no sensor covers this segment and its position was continued
   * from the parent. Drawn as an open frame: a solid forearm would assert a
   * position nothing measured.
   */
  inferred: boolean;
}

interface LimbSpec {
  segment: SegmentId;
  a: number;
  b: number;
  w: number;
  d: number;
}

const LIMBS: LimbSpec[] = [
  { segment: 'leftArm', a: LM.leftShoulder, b: LM.leftElbow, w: 0.038, d: 0.038 },
  { segment: 'rightArm', a: LM.rightShoulder, b: LM.rightElbow, w: 0.038, d: 0.038 },
  { segment: 'leftForearm', a: LM.leftElbow, b: LM.leftWrist, w: 0.03, d: 0.03 },
  { segment: 'rightForearm', a: LM.rightElbow, b: LM.rightWrist, w: 0.03, d: 0.03 },
  { segment: 'leftThigh', a: LM.leftHip, b: LM.leftKnee, w: 0.052, d: 0.052 },
  { segment: 'rightThigh', a: LM.rightHip, b: LM.rightKnee, w: 0.052, d: 0.052 },
  { segment: 'leftShin', a: LM.leftKnee, b: LM.leftAnkle, w: 0.04, d: 0.04 },
  { segment: 'rightShin', a: LM.rightKnee, b: LM.rightAnkle, w: 0.04, d: 0.04 },
];

/** Landmark space (x right 0..1, y down, z toward viewer) → centred body space. */
export function toBody(l: Landmark): P3 {
  return {
    x: (l.x - 0.5) * BODY_SCALE,
    y: -(l.y - 0.5) * BODY_SCALE,
    z: (l.z ?? 0) * BODY_SCALE,
  };
}

function mid(a: P3, b: P3): P3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function along(from: P3, to: P3, t: number): P3 {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  };
}

export function bodyVolumes(landmarks: Landmark[]): BodyVolume[] {
  const at = (i: number): Landmark | null => {
    const l = landmarks[i];
    return l && l.v > VIS ? l : null;
  };
  const out: BodyVolume[] = [];
  const push = (segment: SegmentId, from: P3, to: P3, w: number, d: number, inferred: boolean, ref?: P3) => {
    out.push({ segment, quads: limbBox(from, to, w * BODY_SCALE, d * BODY_SCALE, ref), inferred });
  };

  const ls = at(LM.leftShoulder);
  const rs = at(LM.rightShoulder);
  const lh = at(LM.leftHip);
  const rh = at(LM.rightHip);
  if (ls && rs && lh && rh) {
    const bls = toBody(ls);
    const brs = toBody(rs);
    const shoulderC = mid(bls, brs);
    const hipC = mid(toBody(lh), toBody(rh));
    // the shoulder line gives the trunk its roll, so the chest turns with the
    // body instead of always squarely facing the camera
    const across: P3 = { x: brs.x - bls.x, y: brs.y - bls.y, z: brs.z - bls.z };

    push('torso', hipC, shoulderC, 0.1, 0.062, false, across);
    push('hips', toBody(lh), toBody(rh), 0.055, 0.058, false);
    const neckTop = along(hipC, shoulderC, 1.09);
    push('neck', shoulderC, neckTop, 0.03, 0.03, false, across);
    push('head', neckTop, along(hipC, shoulderC, 1.35), 0.058, 0.058, false, across);
  }

  for (const limb of LIMBS) {
    const a = at(limb.a);
    const b = at(limb.b);
    if (!a || !b) continue;
    // either end being an estimate makes the whole segment an estimate
    push(limb.segment, toBody(a), toBody(b), limb.w, limb.d, a.est === true || b.est === true);
  }

  return out;
}
