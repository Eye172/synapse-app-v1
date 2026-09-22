import { LM } from '@/src/engine/types';

import type { BodyProportions } from './proportions';
import type { WorldPoint } from './types';

/**
 * Bone lengths for *placing* joints, as opposed to sizing the mannequin.
 *
 * These are two different questions and they want two different answers,
 * which is why there are two estimators rather than one shared by both.
 *
 * How thick to draw a thigh depends on how long the thigh really is, and
 * the best evidence for that is the longest it has ever measured, because
 * foreshortening only ever takes length away. That is `BodyMeasure`.
 *
 * Where to put the knee *this frame* is a different matter. Forcing the
 * thigh to its all-time longest reading pushes the knee past where the
 * detector actually saw it, and the shin, ankle and foot all follow —
 * which shows up as the far limb hanging off the person. So this estimator
 * smooths instead of maximising: the frame-to-frame jitter goes, and no
 * length bias arrives with it.
 *
 * Each side is kept apart throughout. A right arm pointing at the lens says
 * nothing about how long the left one is.
 */

export interface BoneSource {
  /** metres, or 0 when this bone has not been seen */
  get(key: string): number;
}

/** Time constant of the smoothing — long enough to kill detector jitter. */
const TAU_MS = 600;
/** Both ends must be at least this visible for a length to count. */
const VIS = 0.6;

/** key, left pair, right pair */
const PAIRS: [string, number, number, number, number][] = [
  ['upperArm', LM.leftShoulder, LM.leftElbow, LM.rightShoulder, LM.rightElbow],
  ['forearm', LM.leftElbow, LM.leftWrist, LM.rightElbow, LM.rightWrist],
  ['hand', LM.leftWrist, LM.leftIndex, LM.rightWrist, LM.rightIndex],
  ['thigh', LM.leftHip, LM.leftKnee, LM.rightHip, LM.rightKnee],
  ['shin', LM.leftKnee, LM.leftAnkle, LM.rightKnee, LM.rightAnkle],
  ['foot', LM.leftAnkle, LM.leftFootIndex, LM.rightAnkle, LM.rightFootIndex],
  ['heel', LM.leftAnkle, LM.leftHeel, LM.rightAnkle, LM.rightHeel],
];

export class BoneLengths implements BoneSource {
  private v: Record<string, number> = {};
  private lastT: number | null = null;

  observe(world: WorldPoint[], t: number): void {
    const dt = this.lastT === null ? TAU_MS : Math.max(1, t - this.lastT);
    this.lastT = t;
    const a = dt / (TAU_MS + dt);

    const span = (i: number, j: number): number | null => {
      const p = world[i];
      const q = world[j];
      if (!p || !q || p.v < VIS || q.v < VIS) return null;
      return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    };
    const push = (key: string, len: number | null): void => {
      if (len === null || !(len > 0)) return;
      const prev = this.v[key];
      this.v[key] = prev === undefined ? len : prev + a * (len - prev);
    };

    for (const [key, la, lb, ra, rb] of PAIRS) {
      push(key + '.L', span(la, lb));
      push(key + '.R', span(ra, rb));
    }
    push('shoulderWidth', span(LM.leftShoulder, LM.rightShoulder));
    push('hipWidth', span(LM.leftHip, LM.rightHip));

    const ls = world[LM.leftShoulder];
    const rs = world[LM.rightShoulder];
    const lh = world[LM.leftHip];
    const rh = world[LM.rightHip];
    if (ls && rs && lh && rh && Math.min(ls.v, rs.v, lh.v, rh.v) >= VIS) {
      push(
        'trunkLength',
        Math.hypot(
          (ls.x + rs.x) / 2 - (lh.x + rh.x) / 2,
          (ls.y + rs.y) / 2 - (lh.y + rh.y) / 2,
          (ls.z + rs.z) / 2 - (lh.z + rh.z) / 2,
        ),
      );
    }
  }

  get(key: string): number {
    return this.v[key] ?? 0;
  }

  reset(): void {
    this.v = {};
    this.lastT = null;
  }
}

/**
 * Read a `BodyProportions` as bone lengths.
 *
 * For pose sources with no history to smooth — a single photograph, or the
 * rig's forward kinematics — there is nothing to average over, so the
 * measured proportions stand in.
 */
export function proportionLengths(p: BodyProportions): BoneSource {
  const table: Record<string, number> = {
    'upperArm.L': p.upperArm,
    'upperArm.R': p.upperArm,
    'forearm.L': p.forearm,
    'forearm.R': p.forearm,
    'hand.L': p.hand,
    'hand.R': p.hand,
    'thigh.L': p.thigh,
    'thigh.R': p.thigh,
    'shin.L': p.shin,
    'shin.R': p.shin,
    'foot.L': p.foot,
    'foot.R': p.foot,
    'heel.L': p.foot * 0.35,
    'heel.R': p.foot * 0.35,
    shoulderWidth: p.shoulderWidth,
    hipWidth: p.hipWidth,
    trunkLength: p.trunkLength,
  };
  return { get: (k) => table[k] ?? 0 };
}

export function isBoneSource(x: BoneSource | BodyProportions): x is BoneSource {
  return typeof (x as BoneSource).get === 'function';
}
