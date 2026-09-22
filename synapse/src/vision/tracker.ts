import { LM, type Landmark } from '@/src/engine/types';

import { BoneLengths, isBoneSource, proportionLengths, type BoneSource } from './boneLengths';
import { OneEuroFilter, type OneEuroConfig } from './oneEuro';
import { BodyMeasure, type BodyProportions } from './proportions';
import type { PoseObservation, WorldPoint } from './types';

/**
 * Motion tracking: turning a stream of independent detections into a body
 * that moves.
 *
 * A detector has no memory. Each frame it finds a person from scratch, and
 * consecutive answers disagree by a few millimetres even when nobody has
 * moved — which is invisible in a list of numbers and impossible to ignore
 * once a figure is drawn on top of someone. It also runs slower than the
 * screen redraws, so without anything in between, the overlay steps along
 * behind the lifter instead of staying on them.
 *
 * Three jobs, then. Smooth the noise without adding lag, which is what the
 * One Euro filters do. Carry a joint through the moments the detector loses
 * it, fading rather than snapping, which is what the confidence decay does.
 * And hand the renderer a pose for the instant it is drawing, not the
 * instant the last frame arrived, which is what prediction does.
 */

export interface TrackedPose {
  /** the moment this pose describes, ms */
  t: number;
  /** normalized image space, smoothed */
  image: Landmark[];
  /** metric body space, smoothed and held to measured bone lengths */
  world: WorldPoint[];
  proportions: BodyProportions;
  /** how fast the body's centre is travelling, m/s */
  speed: number;
  /** 0..1 fraction of the body currently being seen */
  coverage: number;
  /** ms since the last real detection — the overlay fades as this grows */
  age: number;
}

/**
 * Tuned per space, because they are not the same signal.
 *
 * Image coordinates decide whether the figure sits on the person, so they
 * are allowed to track harder: a little jitter is a fair price for not
 * sliding off during a fast rep. World coordinates decide the *shape* of
 * the mannequin, and shape should not shimmer, so they are cut harder.
 *
 * The beta values are not free. A first-order filter lags a moving signal
 * by about 1/(2*pi*cutoff) seconds, so holding the overlay inside one frame
 * of the body needs the cutoff up near 5 Hz while a rep is happening. Beta
 * is what buys that: cutoff = minCutoff + beta * speed, so it has to be
 * roughly (5 - minCutoff) divided by the speed a joint actually reaches —
 * around 0.6 m/s in world space, and about 0.4 screen-heights per second
 * in image space. Betas a hundredth of these look like sensible small
 * numbers and silently cost a fifth of a second of lag.
 */
const IMAGE_FILTER: OneEuroConfig = { minCutoff: 1.1, beta: 10, dCutoff: 1, vGate: 0.02 };
const WORLD_FILTER: OneEuroConfig = { minCutoff: 0.7, beta: 7, dCutoff: 1, vGate: 0.06 };

/** Below this a detection is not evidence, and the last good value stands. */
const VIS_GATE = 0.35;
/** A joint unseen for longer than this stops being drawn at all. */
const HOLD_MS = 500;
/**
 * How far ahead the pose may be extrapolated.
 *
 * Prediction buys back the gap between a slow detector and a fast screen,
 * but it is a guess that grows wrong quadratically. Past about two camera
 * frames it overshoots visibly on direction changes — the bottom of a
 * squat is exactly where it would look worst — so it is capped well short
 * of that.
 */
const MAX_PREDICT_MS = 55;

class TrackedPoint {
  readonly x: OneEuroFilter;
  readonly y: OneEuroFilter;
  readonly z: OneEuroFilter;
  /** last believed visibility, decayed while the detector cannot see it */
  v = 0;
  lastSeen = 0;
  /**
   * Whether this point has ever been observed.
   *
   * Kept apart from `lastSeen` because zero is a perfectly ordinary
   * timestamp — a video starts at zero, and so does any monotonic clock the
   * moment it is zeroed — and treating it as "never seen" makes the whole
   * body vanish on the first frame.
   */
  seen = false;

  constructor(cfg: OneEuroConfig) {
    this.x = new OneEuroFilter(cfg);
    this.y = new OneEuroFilter(cfg);
    this.z = new OneEuroFilter(cfg);
  }

  feed(x: number, y: number, z: number, v: number, t: number): void {
    this.x.filter(x, t);
    this.y.filter(y, t);
    this.z.filter(z, t);
    this.v = v;
    this.lastSeen = t;
    this.seen = true;
  }

  /**
   * Where this joint is `ahead` ms after the last detection.
   *
   * Always through `predict`, even when `ahead` is zero: the filter's own
   * lag is there either way, and reading the estimate bare would leave the
   * figure trailing the body by a frame whenever it moves.
   */
  read(ahead: number): { x: number; y: number; z: number } | null {
    const x = this.x.predict(ahead);
    const y = this.y.predict(ahead);
    const z = this.z.predict(ahead);
    if (x === null || y === null || z === null) return null;
    return { x, y, z };
  }

  get speed(): number {
    return Math.hypot(this.x.velocity, this.y.velocity, this.z.velocity);
  }

  reset(): void {
    this.x.reset();
    this.y.reset();
    this.z.reset();
    this.v = 0;
    this.lastSeen = 0;
    this.seen = false;
  }
}

export class PoseTracker {
  private img: TrackedPoint[] = [];
  private wld: TrackedPoint[] = [];
  private measure = new BodyMeasure();
  private bones = new BoneLengths();
  private lastT = 0;
  private started = false;
  private frameW = 0;
  private frameH = 0;

  constructor(private opts: { rigid?: boolean } = {}) {
    for (let i = 0; i < 33; i++) {
      this.img.push(new TrackedPoint(IMAGE_FILTER));
      this.wld.push(new TrackedPoint(WORLD_FILTER));
    }
  }

  get frame(): { width: number; height: number } {
    return { width: this.frameW, height: this.frameH };
  }

  get proportions(): BodyProportions {
    return this.measure.proportions;
  }

  update(obs: PoseObservation): void {
    this.lastT = obs.t;
    this.started = true;
    this.frameW = obs.frame.width;
    this.frameH = obs.frame.height;

    for (let i = 0; i < 33; i++) {
      const p = obs.image[i];
      if (p && p.v >= VIS_GATE) {
        this.img[i]!.feed(p.x, p.y, p.z ?? 0, p.v, obs.t);
      } else if (this.img[i]!.seen) {
        // seen before, not now: let it fade rather than vanish, so a hand
        // passing behind the body does not make the arm blink
        this.img[i]!.v *= 0.8;
      }
    }

    if (obs.world) {
      for (let i = 0; i < 33; i++) {
        const w = obs.world[i];
        if (w && w.v >= VIS_GATE) this.wld[i]!.feed(w.x, w.y, w.z, w.v, obs.t);
        else if (this.wld[i]!.seen) this.wld[i]!.v *= 0.8;
      }
      this.measure.observe(obs.world);
      this.bones.observe(obs.world, obs.t);
    }
  }

  /**
   * The pose as of time `t`, carried forward from the last detection.
   *
   * Returns null before anything has been seen — the overlay draws nothing
   * rather than a default body, because a figure standing in the middle of
   * the screen that is not the user is worse than no figure.
   */
  sample(t: number): TrackedPose | null {
    if (!this.started) return null;
    const age = Math.max(0, t - this.lastT);
    const ahead = Math.min(age, MAX_PREDICT_MS);

    const image: Landmark[] = [];
    const world: WorldPoint[] = [];
    let seen = 0;

    for (let i = 0; i < 33; i++) {
      const ip = this.img[i]!;
      const wp = this.wld[i]!;
      const gone = !ip.seen || t - ip.lastSeen > HOLD_MS;
      const iv = gone ? 0 : ip.v;
      const r = ip.read(ahead);
      image.push(r === null || gone ? { x: 0, y: 0, z: 0, v: 0 } : { x: r.x, y: r.y, z: r.z, v: iv });

      const wgone = !wp.seen || t - wp.lastSeen > HOLD_MS;
      const w = wp.read(ahead);
      world.push(w === null || wgone ? { x: 0, y: 0, z: 0, v: 0 } : { ...w, v: wp.v });
      if (iv > VIS_GATE) seen++;
    }

    const proportions = this.measure.proportions;
    // smoothed lengths place the joints; the maximised proportions size the
    // solids that get hung on them
    const solved = this.opts.rigid === false ? world : rigidify(world, this.bones);

    // the hips are the body's own frame of reference, so their speed is the
    // speed of the lifter rather than of any one flailing limb
    const speed = (this.wld[LM.leftHip]!.speed + this.wld[LM.rightHip]!.speed) / 2;

    return { t, image, world: solved, proportions, speed, coverage: seen / 33, age };
  }

  reset(): void {
    for (const p of this.img) p.reset();
    for (const p of this.wld) p.reset();
    this.measure.reset();
    this.bones.reset();
    this.started = false;
    this.lastT = 0;
  }
}

// ---------------------------------------------------------------------------

type V = { x: number; y: number; z: number };

const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const norm = (a: V): V => {
  const l = Math.hypot(a.x, a.y, a.z);
  return l < 1e-9 ? { x: 0, y: 0, z: 0 } : { x: a.x / l, y: a.y / l, z: a.z / l };
};
const dot = (a: V, b: V): number => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Hold the skeleton to the bone lengths this body actually has.
 *
 * A detector estimates every joint independently, so the distance between
 * two of them drifts by a centimetre or two from frame to frame — limbs
 * that visibly grow and shrink through a rep. Since real bones do not
 * change length, each joint keeps the *direction* the detector found and is
 * moved to the *distance* the body was measured at. What is left is a
 * skeleton that can only rotate, which is the only thing a skeleton can
 * really do.
 *
 * The chain runs outward from the hips, so an error at a shoulder does not
 * travel down into the hand.
 */
export function rigidify(world: WorldPoint[], source: BoneSource | BodyProportions): WorldPoint[] {
  const bones = isBoneSource(source) ? source : proportionLengths(source);
  const L = (key: string): number => bones.get(key);
  const out = world.map((w) => ({ ...w }));
  const has = (i: number): boolean => (out[i]?.v ?? 0) > 0;
  const at = (i: number): V => out[i]!;

  /** Move `child` along its own direction from `parent` to the right length. */
  const bone = (parent: number, child: number, length: number): void => {
    if (!has(parent) || !has(child) || !(length > 0)) return;
    const dir = norm(sub(at(child), at(parent)));
    if (dir.x === 0 && dir.y === 0 && dir.z === 0) return;
    const fixed = add(at(parent), mul(dir, length));
    out[child] = { ...out[child]!, ...fixed };
  };

  /** Re-space a symmetric pair about their own midpoint. */
  const span = (l: number, r: number, width: number): void => {
    if (!has(l) || !has(r) || !(width > 0)) return;
    const c = mul(add(at(l), at(r)), 0.5);
    const dir = norm(sub(at(r), at(l)));
    if (dir.x === 0 && dir.y === 0 && dir.z === 0) return;
    out[l] = { ...out[l]!, ...sub(c, mul(dir, width / 2)) };
    out[r] = { ...out[r]!, ...add(c, mul(dir, width / 2)) };
  };

  span(LM.leftHip, LM.rightHip, L('hipWidth'));

  // the shoulder line is placed at the measured trunk length above the
  // hips, along the trunk the detector found, then squared across it
  if (has(LM.leftHip) && has(LM.rightHip) && has(LM.leftShoulder) && has(LM.rightShoulder)) {
    const hipC = mul(add(at(LM.leftHip), at(LM.rightHip)), 0.5);
    const shC = mul(add(at(LM.leftShoulder), at(LM.rightShoulder)), 0.5);
    const up = norm(sub(shC, hipC));
    if (up.x !== 0 || up.y !== 0 || up.z !== 0) {
      const target = add(hipC, mul(up, L('trunkLength')));
      let across = norm(sub(at(LM.rightShoulder), at(LM.leftShoulder)));
      // a shoulder line is perpendicular to the spine; keep only that part
      across = norm(sub(across, mul(up, dot(across, up))));
      if (across.x !== 0 || across.y !== 0 || across.z !== 0) {
        const half = L('shoulderWidth') / 2;
        out[LM.leftShoulder] = { ...out[LM.leftShoulder]!, ...sub(target, mul(across, half)) };
        out[LM.rightShoulder] = { ...out[LM.rightShoulder]!, ...add(target, mul(across, half)) };
      }
    }
  }

  // each side uses its own length: a right arm pointing at the lens says
  // nothing about how long the left one is
  bone(LM.leftShoulder, LM.leftElbow, L('upperArm.L'));
  bone(LM.rightShoulder, LM.rightElbow, L('upperArm.R'));
  bone(LM.leftElbow, LM.leftWrist, L('forearm.L'));
  bone(LM.rightElbow, LM.rightWrist, L('forearm.R'));
  bone(LM.leftWrist, LM.leftIndex, L('hand.L'));
  bone(LM.rightWrist, LM.rightIndex, L('hand.R'));

  bone(LM.leftHip, LM.leftKnee, L('thigh.L'));
  bone(LM.rightHip, LM.rightKnee, L('thigh.R'));
  bone(LM.leftKnee, LM.leftAnkle, L('shin.L'));
  bone(LM.rightKnee, LM.rightAnkle, L('shin.R'));
  bone(LM.leftAnkle, LM.leftFootIndex, L('foot.L'));
  bone(LM.rightAnkle, LM.rightFootIndex, L('foot.R'));
  bone(LM.leftAnkle, LM.leftHeel, L('heel.L'));
  bone(LM.rightAnkle, LM.rightHeel, L('heel.R'));

  return out;
}
