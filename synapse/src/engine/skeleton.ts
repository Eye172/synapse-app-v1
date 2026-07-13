import { LM, type Landmark, type SegmentId } from './types';

/** A drawable bone: two landmark indices + the grading segment it belongs to. */
export interface Bone {
  a: number;
  b: number;
  segment: SegmentId;
}

/** The Mesh draw list (subset of BlazePose topology, tinted per segment). */
export const BONES: Bone[] = [
  // torso frame
  { a: LM.leftShoulder, b: LM.rightShoulder, segment: 'torso' },
  { a: LM.leftShoulder, b: LM.leftHip, segment: 'torso' },
  { a: LM.rightShoulder, b: LM.rightHip, segment: 'torso' },
  { a: LM.leftHip, b: LM.rightHip, segment: 'hips' },
  // arms
  { a: LM.leftShoulder, b: LM.leftElbow, segment: 'leftArm' },
  { a: LM.leftElbow, b: LM.leftWrist, segment: 'leftForearm' },
  { a: LM.rightShoulder, b: LM.rightElbow, segment: 'rightArm' },
  { a: LM.rightElbow, b: LM.rightWrist, segment: 'rightForearm' },
  // legs
  { a: LM.leftHip, b: LM.leftKnee, segment: 'leftThigh' },
  { a: LM.leftKnee, b: LM.leftAnkle, segment: 'leftShin' },
  { a: LM.rightHip, b: LM.rightKnee, segment: 'rightThigh' },
  { a: LM.rightKnee, b: LM.rightAnkle, segment: 'rightShin' },
  // feet
  { a: LM.leftAnkle, b: LM.leftFootIndex, segment: 'leftShin' },
  { a: LM.rightAnkle, b: LM.rightFootIndex, segment: 'rightShin' },
];

/** Node dots drawn on the Mesh; tinted by the max severity of touching segments. */
export const NODE_LANDMARKS: { lm: number; r: number; segments: SegmentId[] }[] = [
  { lm: LM.nose, r: 10, segments: ['head', 'neck'] },
  { lm: LM.leftShoulder, r: 6, segments: ['torso', 'leftArm', 'neck'] },
  { lm: LM.rightShoulder, r: 6, segments: ['torso', 'rightArm', 'neck'] },
  { lm: LM.leftElbow, r: 5, segments: ['leftArm', 'leftForearm'] },
  { lm: LM.rightElbow, r: 5, segments: ['rightArm', 'rightForearm'] },
  { lm: LM.leftWrist, r: 4, segments: ['leftForearm'] },
  { lm: LM.rightWrist, r: 4, segments: ['rightForearm'] },
  { lm: LM.leftHip, r: 6, segments: ['hips', 'torso', 'leftThigh'] },
  { lm: LM.rightHip, r: 6, segments: ['hips', 'torso', 'rightThigh'] },
  { lm: LM.leftKnee, r: 6, segments: ['leftThigh', 'leftShin'] },
  { lm: LM.rightKnee, r: 6, segments: ['rightThigh', 'rightShin'] },
  { lm: LM.leftAnkle, r: 5, segments: ['leftShin'] },
  { lm: LM.rightAnkle, r: 5, segments: ['rightShin'] },
];

/** The virtual "neck" bone (shoulder midpoint → nose) is drawn separately. */
export function neckLine(landmarks: Landmark[]): { ax: number; ay: number; bx: number; by: number } | null {
  const ls = landmarks[LM.leftShoulder];
  const rs = landmarks[LM.rightShoulder];
  const nose = landmarks[LM.nose];
  if (!ls || !rs || !nose) return null;
  return { ax: (ls.x + rs.x) / 2, ay: (ls.y + rs.y) / 2, bx: nose.x, by: nose.y };
}

/**
 * The backbone: a segmented virtual bone down the middle of the torso
 * (shoulder midpoint → hip midpoint) with vertebra points. This is where
 * spine severity is pointed at — a spine coach must be able to show a spine.
 * The line bows toward the head's forward kink so a rounded back visibly
 * curves.
 */
export function spineChain(
  landmarks: Landmark[],
  points = 4,
): { x: number; y: number }[] | null {
  const ls = landmarks[LM.leftShoulder];
  const rs = landmarks[LM.rightShoulder];
  const lh = landmarks[LM.leftHip];
  const rh = landmarks[LM.rightHip];
  const nose = landmarks[LM.nose];
  if (!ls || !rs || !lh || !rh) return null;
  const top = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const bot = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };

  // bow direction ≈ where the head kinks relative to the torso axis
  let bowX = 0;
  let bowY = 0;
  if (nose) {
    const ax = bot.x - top.x;
    const ay = bot.y - top.y;
    const len = Math.hypot(ax, ay) + 1e-6;
    const hx = nose.x - top.x;
    const hy = nose.y - top.y;
    // head offset projected off the torso axis
    const along = (hx * ax + hy * ay) / len;
    const px = hx - (along * ax) / len;
    const py = hy - (along * ay) / len;
    const mag = Math.hypot(px, py);
    const bowAmt = Math.min(0.35, mag * 0.9);
    if (mag > 1e-6) {
      bowX = (px / mag) * bowAmt * len;
      bowY = (py / mag) * bowAmt * len;
    }
  }

  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const bow = Math.sin(Math.PI * t); // max bow mid-spine
    out.push({
      x: top.x + (bot.x - top.x) * t + bowX * bow,
      y: top.y + (bot.y - top.y) * t + bowY * bow,
    });
  }
  return out;
}
