import { LM, type Landmark } from '@/src/engine/types';

/**
 * Is the lifter framed well enough to grade? Decided from what the camera
 * actually sees — never from a target pose they have to match.
 *
 * A set is graded from shoulders, hips, knees and ankles; if any of them is
 * off the screen or too dim to trust, the numbers that depend on it are
 * guesses. So position-lock asks exactly that: are all eight on screen and
 * clearly seen, and has the camera been solved so the 3D body stands on the
 * person? When the answer is no, it says which fix the lifter needs, in the
 * order they should try them.
 *
 * Landmarks here are in *screen* space (normalized 0..1 over what the
 * preview shows, after crop and mirror) — "in frame" means what the lifter
 * can see on the phone, not what the sensor captured beyond the crop.
 */

export type FramingIssue =
  /** nobody found */
  | 'nobody'
  /** head or shoulders cut off at the top */
  | 'head'
  /** knees or feet cut off, or not seen */
  | 'feet'
  /** the body runs off the left or right edge */
  | 'edge'
  /** on screen, but joints too dim or hidden to trust */
  | 'unclear'
  /** framed; the body is still being measured and the camera solved */
  | 'measuring'
  | 'ready';

export interface Framing {
  issue: FramingIssue;
  /** how many of the graded joints are on screen and clearly seen */
  seen: number;
  total: number;
}

/** The joints every lift is graded from. */
export const FRAMED_JOINTS = [
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftHip,
  LM.rightHip,
  LM.leftKnee,
  LM.rightKnee,
  LM.leftAnkle,
  LM.rightAnkle,
] as const;

/** Visibility the detector must report before a joint counts as seen. */
export const MIN_VISIBILITY = 0.5;
/** A joint this close to the screen edge is as good as off it: the next rep takes it out. */
export const EDGE_MARGIN = 0.03;

const LOWER = new Set<number>([LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle]);

export function assessFraming(screen: readonly Landmark[] | null, placed: boolean): Framing {
  const total = FRAMED_JOINTS.length;
  if (!screen || screen.length < 33) return { issue: 'nobody', seen: 0, total };

  let seen = 0;
  let anySeen = false;
  let head = false;
  let feet = false;
  let edge = false;
  let unclear = false;

  for (const i of FRAMED_JOINTS) {
    const p = screen[i]!;
    const visible = p.v >= MIN_VISIBILITY;
    const inX = p.x >= EDGE_MARGIN && p.x <= 1 - EDGE_MARGIN;
    const inY = p.y >= EDGE_MARGIN && p.y <= 1 - EDGE_MARGIN;
    if (visible) anySeen = true;
    if (visible && inX && inY) {
      seen++;
      continue;
    }
    if (visible && p.y < EDGE_MARGIN) head = true;
    else if (LOWER.has(i) && (!visible || p.y > 1 - EDGE_MARGIN)) feet = true;
    else if (visible && !inX) edge = true;
    else unclear = true;
  }

  const nose = screen[LM.nose]!;
  if (nose.v >= MIN_VISIBILITY && nose.y < 0) head = true;

  if (!anySeen) return { issue: 'nobody', seen, total };
  // the top first: stepping back fixes a cut-off head and cut-off feet alike
  if (head) return { issue: 'head', seen, total };
  if (feet) return { issue: 'feet', seen, total };
  if (edge) return { issue: 'edge', seen, total };
  if (unclear) return { issue: 'unclear', seen, total };
  if (!placed) return { issue: 'measuring', seen, total };
  return { issue: 'ready', seen, total };
}

/** What the lifter is told to do about each issue. */
export const FRAMING_HINT: Record<FramingIssue, { title: string; hint: string }> = {
  nobody: { title: 'Step into the frame', hint: 'STAND WHERE THE CAMERA CAN SEE ALL OF YOU' },
  head: { title: 'Step back', hint: 'YOUR HEAD IS OUT OF THE FRAME' },
  feet: { title: 'Step back', hint: 'THE CAMERA NEEDS YOUR KNEES AND FEET' },
  edge: { title: 'Move to the middle', hint: 'PART OF YOU IS OFF THE SIDE OF THE FRAME' },
  unclear: { title: 'Face the camera', hint: 'SOME JOINTS ARE HIDDEN — MORE LIGHT, LESS BAGGY CLOTHING' },
  measuring: { title: 'Hold still', hint: 'MEASURING YOUR BODY' },
  ready: { title: 'Hold it', hint: 'LOCKING POSITION' },
};
