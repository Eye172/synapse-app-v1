import { LM } from '@/src/engine/types';

import type { WorldPoint } from './types';

/**
 * How big this particular person is, measured from them.
 *
 * The mannequin used to derive every thickness from the trunk with fixed
 * fractions, which is only correct for the one body those fractions were
 * eyeballed against. A long-limbed lifter got a stubby figure, a broad one
 * got a narrow one, and a chest block nearly as wide as the shoulder span
 * sat on everybody. Measuring instead means the silhouette is the user's
 * own — and it has to be measured over time rather than per frame, because
 * a bone pointing at the camera measures short and a figure rebuilt from
 * each frame's numbers would breathe in and out through every rep.
 *
 * Fractions of standing height below are Winter's segment proportions
 * (Biomechanics and Motor Control of Human Movement). They are used two
 * ways: to turn whatever *was* measured into an estimate of overall height,
 * and to fill in whatever was not.
 */

/** Segment length as a fraction of standing height. */
const H = {
  shoulderWidth: 0.245,
  hipWidth: 0.191,
  trunk: 0.288,
  upperArm: 0.186,
  forearm: 0.146,
  hand: 0.108,
  thigh: 0.245,
  shin: 0.246,
  foot: 0.152,
  headHeight: 0.13,
  neck: 0.052,
} as const;

/** A body of ordinary size, used until the camera has seen a real one. */
export const DEFAULT_HEIGHT = 1.72;

export interface BodyProportions {
  /** estimated standing height, metres — the scale everything hangs off */
  height: number;
  shoulderWidth: number;
  hipWidth: number;
  trunkLength: number;
  upperArm: number;
  forearm: number;
  hand: number;
  thigh: number;
  shin: number;
  foot: number;
  headHeight: number;
  neck: number;
  /** 0..1 — how much of this was measured rather than assumed */
  confidence: number;
}

export function defaultProportions(height = DEFAULT_HEIGHT): BodyProportions {
  return {
    height,
    shoulderWidth: height * H.shoulderWidth,
    hipWidth: height * H.hipWidth,
    trunkLength: height * H.trunk,
    upperArm: height * H.upperArm,
    forearm: height * H.forearm,
    hand: height * H.hand,
    thigh: height * H.thigh,
    shin: height * H.shin,
    foot: height * H.foot,
    headHeight: height * H.headHeight,
    neck: height * H.neck,
    confidence: 0,
  };
}

/**
 * The girths the mannequin is actually built from.
 *
 * None of these can be measured from a single viewpoint — a camera in front
 * of someone cannot see how deep their chest is — so they are derived from
 * the widths that *were* measured. That keeps them adaptive: a broad person
 * gets a broad chest because their own shoulder span says so, not because a
 * constant was tuned on somebody else.
 */
/** A limb's cross-section: thicker at one end than the other, and oval. */
export interface Tube {
  rFrom: number;
  rTo: number;
  /** depth as a fraction of width; 1 is round */
  flatten: number;
}

export interface BodyGirths {
  chestWidth: number;
  chestDepth: number;
  pelvisWidth: number;
  pelvisDepth: number;
  /** crest to seat — the pelvis block's vertical extent, not its span */
  pelvisHeight: number;
  /** hips end to chest end */
  waist: Tube;
  /** shoulders end to skull end */
  neck: Tube;
  headWidth: number;
  headDepth: number;
  /** shoulder end to elbow end */
  upperArm: Tube;
  /** elbow end to wrist end */
  forearm: Tube;
  /** hip end to knee end */
  thigh: Tube;
  /** knee end to ankle end */
  shin: Tube;
  handWidth: number;
  handThickness: number;
  footWidth: number;
  footHeight: number;
  shoulderRadius: number;
  elbowRadius: number;
  kneeRadius: number;
}

/**
 * Ratios with a reason.
 *
 * The chest one matters most. A shoulder landmark sits on the acromion —
 * the outer corner of the deltoid — so the distance between them spans the
 * shoulders, not the ribcage, and the ribcage is about three quarters of
 * it. Building the chest at nearly the full shoulder span, and as deep as
 * it is wide, is what made the old figure read as a barrel with limbs.
 */
export function girthsFor(p: BodyProportions): BodyGirths {
  const chestWidth = p.shoulderWidth * 0.72;
  const chestDepth = chestWidth * 0.64;
  const pelvisWidth = p.hipWidth * 1.14;
  const headWidth = p.headHeight * 0.66;

  // Limb radii are fractions of that limb's own measured bone, so a long
  // femur gets a long *and* proportionately thick thigh. The two ends
  // differ because limbs do: mid-thigh girth is around 58 cm on an adult
  // and just above the knee around 40, which is the difference between a
  // figure that looks like a person and one that looks like plumbing.
  // Values sit a little above bare anatomy, since what a camera sees is a
  // clothed body.
  return {
    chestWidth,
    chestDepth,
    pelvisWidth,
    pelvisDepth: pelvisWidth * 0.72,
    pelvisHeight: pelvisWidth * 0.58,
    // the waist is the widest-to-deepest part of the body, so it is the
    // one that suffers most from being forced round
    waist: { rFrom: pelvisWidth * 0.46, rTo: chestWidth * 0.47, flatten: chestDepth / chestWidth },
    neck: { rFrom: headWidth * 0.46, rTo: headWidth * 0.38, flatten: 0.88 },
    headWidth,
    headDepth: p.headHeight * 0.82,
    upperArm: { rFrom: p.upperArm * 0.2, rTo: p.upperArm * 0.135, flatten: 0.92 },
    forearm: { rFrom: p.forearm * 0.175, rTo: p.forearm * 0.1, flatten: 0.88 },
    thigh: { rFrom: p.thigh * 0.23, rTo: p.thigh * 0.155, flatten: 0.9 },
    shin: { rFrom: p.shin * 0.155, rTo: p.shin * 0.085, flatten: 0.9 },
    handWidth: p.hand * 0.46,
    handThickness: p.hand * 0.2,
    footWidth: p.foot * 0.36,
    footHeight: p.foot * 0.26,
    shoulderRadius: p.upperArm * 0.215,
    elbowRadius: p.upperArm * 0.15,
    kneeRadius: p.thigh * 0.17,
  };
}

// ---------------------------------------------------------------------------

/** Both endpoints must be this visible before a length is believed. */
const VIS_GATE = 0.6;

/**
 * How fast a length estimate gives ground.
 *
 * A limb can only ever *measure* shorter than it is — foreshortening takes
 * length away and nothing adds any — so the longest honest observation is
 * the best one, and the estimate rises to meet it immediately.
 *
 * Decay exists only to undo a bad early reading, which is rare, so it is
 * set to a half-life of minutes rather than seconds. Anything faster and
 * the figure visibly slims while the lifter is turned away from the lens
 * and their limbs are all measuring short — which is the normal case
 * during a set, not an error to correct.
 */
const DECAY = 0.99992;

/**
 * How far a bone may sit from its anatomical value before being doubted.
 *
 * Real people vary: shoulder breadth across adults spans roughly a tenth
 * either side of average, limb lengths a little less. Half again as much is
 * therefore generous to genuine build and still firm about nonsense — at
 * this setting a body a fifth broader than average keeps about seventeen of
 * those twenty percent, while one measured at twice the width keeps four.
 */
const TOLERANCE = 0.5;

/** Frames a bone must be seen in before its measurement counts in full. */
const EVIDENCE_FRAMES = 15;

/**
 * Ankle joint to the floor, as a fraction of standing height.
 *
 * The landmark chain stops at the ankle, but a person does not: what is
 * left is the heel and the few centimetres of foot under the joint. Without
 * it every stature comes out short by about four percent.
 */
const ANKLE_RISE = 0.039;

class Length {
  private est = 0;
  private samples = 0;

  observe(v: number): void {
    if (!(v > 0) || !Number.isFinite(v)) return;
    this.samples++;
    this.est = Math.max(v, this.est * DECAY);
  }

  get value(): number {
    return this.est;
  }
  get seen(): number {
    return this.samples;
  }
}

export class BodyMeasure {
  private lengths: Record<string, Length> = {};
  private frames = 0;

  private track(key: string, v: number): void {
    (this.lengths[key] ??= new Length()).observe(v);
  }

  /** A bone's best length and how much evidence stands behind it. */
  private stat(key: string): { value: number; samples: number } {
    const both = this.lengths[key];
    if (both) return { value: both.value, samples: both.seen };
    // a paired bone: the two sides agree in truth, so average their bests
    const l = this.lengths[key + '.L'];
    const r = this.lengths[key + '.R'];
    const lv = l?.value ?? 0;
    const rv = r?.value ?? 0;
    const samples = (l?.seen ?? 0) + (r?.seen ?? 0);
    if (lv > 0 && rv > 0) return { value: (lv + rv) / 2, samples };
    return { value: Math.max(lv, rv), samples };
  }

  private read(key: string): number {
    return this.stat(key).value;
  }

  /** One side's own longest reading, for placing that side's joints. */
  side(key: string, side: 'L' | 'R'): number {
    return this.lengths[key + '.' + side]?.value ?? this.read(key);
  }

  /** Feed one frame of metric world points. */
  observe(world: WorldPoint[]): void {
    const at = (i: number): WorldPoint | null => {
      const p = world[i];
      return p && p.v >= VIS_GATE ? p : null;
    };
    const span = (a: number, b: number): number | null => {
      const p = at(a);
      const q = at(b);
      if (!p || !q) return null;
      return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    };
    /**
     * Left and right are the same bone, but they must be tracked apart
     * before they are combined.
     *
     * Averaging first and taking the longest afterwards is subtly wrong:
     * if one arm is square to the lens while the other points at it, the
     * average is dragged down by the foreshortened side, and since the
     * estimator only ever keeps the longest value it has seen, that low
     * average is the best it will ever get. The bone comes out short, the
     * joint below it is placed short, and the whole limb sits off the
     * person. Each side keeps its own longest reading, and only those two
     * are averaged.
     */
    const pair = (key: string, l: [number, number], r: [number, number]): void => {
      const a = span(l[0], l[1]);
      const b = span(r[0], r[1]);
      if (a !== null) this.track(key + '.L', a);
      if (b !== null) this.track(key + '.R', b);
    };

    this.frames++;
    const sw = span(LM.leftShoulder, LM.rightShoulder);
    if (sw !== null) this.track('shoulderWidth', sw);
    const hw = span(LM.leftHip, LM.rightHip);
    if (hw !== null) this.track('hipWidth', hw);

    const ls = at(LM.leftShoulder);
    const rs = at(LM.rightShoulder);
    const lh = at(LM.leftHip);
    const rh = at(LM.rightHip);
    if (ls && rs && lh && rh) {
      this.track(
        'trunkLength',
        Math.hypot(
          (ls.x + rs.x) / 2 - (lh.x + rh.x) / 2,
          (ls.y + rs.y) / 2 - (lh.y + rh.y) / 2,
          (ls.z + rs.z) / 2 - (lh.z + rh.z) / 2,
        ),
      );
    }

    pair('upperArm', [LM.leftShoulder, LM.leftElbow], [LM.rightShoulder, LM.rightElbow]);
    pair('forearm', [LM.leftElbow, LM.leftWrist], [LM.rightElbow, LM.rightWrist]);
    pair('hand', [LM.leftWrist, LM.leftIndex], [LM.rightWrist, LM.rightIndex]);
    pair('thigh', [LM.leftHip, LM.leftKnee], [LM.rightHip, LM.rightKnee]);
    pair('shin', [LM.leftKnee, LM.leftAnkle], [LM.rightKnee, LM.rightAnkle]);
    pair('foot', [LM.leftHeel, LM.leftFootIndex], [LM.rightHeel, LM.rightFootIndex]);

    // The ear line is deliberately not used to size the head.
    //
    // It is the only direct measurement of a skull available, and it is
    // measured in a different effective scale from the rest of the body.
    // Detectors reconstruct the face from a fixed canonical head, so it
    // comes out near life size, while the torso and limbs come out
    // compressed — on a real lifter the ear span read 15 cm against a
    // shoulder span of 28, a ratio of 0.54 where a human is 0.37. Sizing
    // the head from it drew a skull wider than the shoulders.
    //
    // A mannequin has to be consistent with itself before it is correct in
    // absolute terms, because it is judged against the person underneath
    // it, not against a tape measure. So the head is sized from the same
    // height estimate as everything else.
  }

  /**
   * The best current estimate, with anything unmeasured filled in from the
   * height that the measured parts imply.
   */
  get proportions(): BodyProportions {
    // every measured part votes on overall height through its own ratio,
    // so a person seen only from the waist up still gets a sane scale
    const votes: number[] = [];
    const vote = (key: string, ratio: number): void => {
      const v = this.read(key);
      if (v > 0) votes.push(v / ratio);
    };
    vote('trunkLength', H.trunk);
    vote('shoulderWidth', H.shoulderWidth);
    vote('thigh', H.thigh);
    vote('shin', H.shin);
    vote('upperArm', H.upperArm);
    vote('forearm', H.forearm);
    vote('hipWidth', H.hipWidth);

    if (votes.length === 0) return defaultProportions();

    // Median, not mean: one blown-up detection should not stretch the body.
    //
    // What this gives is a reference scale — the standing height that best
    // explains most of what was measured — and it is deliberately blind to
    // a minority of parts disagreeing, because that is usually a detector
    // having trouble rather than an unusual body. It is not yet the
    // person's height; see below.
    votes.sort((a, b) => a - b);
    const scale = votes[(votes.length - 1) >> 1]!;

    const base = defaultProportions(scale);

    /**
     * Reconcile one measurement with what a body that height should have.
     *
     * The figure has to be two things at once: the user's own, and a
     * plausible human. Trusting the detector outright gives the first and
     * loses the second — one badly tracked frame and a forearm is longer
     * than an upper arm. Ignoring it and drawing the textbook body gives
     * the second and loses the first, which is the whole point of measuring
     * anybody.
     *
     * So a measurement is kept in proportion to how believable it is. Near
     * the anatomical value it passes through almost untouched, so a
     * genuinely broad-shouldered lifter stays broad-shouldered. The further
     * out it goes the harder it is pulled back, so a bone twice as long as
     * it should be ends up barely a fifth over instead. There is no
     * threshold, no point where one more millimetre flips the answer from
     * fully believed to entirely discarded — which is what the old
     * accept-or-reject rule did, and it meant two nearly identical bodies
     * could be drawn quite differently.
     */
    const reconcile = (key: string, expected: number): number => {
      const { value, samples } = this.stat(key);
      if (value <= 0 || expected <= 0) return expected;
      const ratio = value / expected;
      // one departure's worth of disagreement halves the trust
      const off = (ratio - 1) / TOLERANCE;
      const believable = 1 / (1 + off * off);
      // and a bone seen twice is not evidence about a body either way
      const evidence = Math.min(1, samples / EVIDENCE_FRAMES);
      return expected * (1 + believable * evidence * (ratio - 1));
    };

    const measured = [
      'trunkLength',
      'shoulderWidth',
      'hipWidth',
      'upperArm',
      'forearm',
      'thigh',
      'shin',
    ].filter((k) => this.read(k) > 0).length;

    const trunkLength = reconcile('trunkLength', base.trunkLength);
    const thigh = reconcile('thigh', base.thigh);
    const shin = reconcile('shin', base.shin);

    /**
     * Standing height, added up rather than voted on.
     *
     * The reference scale above is a robust middle, which is what
     * reconciliation needs but not what "how tall is this person" means: a
     * long-legged lifter with an ordinary torso really is taller, and a
     * median over ratios shrugs that off as two parts out of seven
     * disagreeing. Once every segment has been settled, stature is just the
     * sum of the ones stacked on top of each other — skull, neck, trunk,
     * thigh, shin, and the few centimetres of ankle and heel under it.
     */
    const height =
      base.headHeight + base.neck + trunkLength + thigh + shin + scale * ANKLE_RISE;

    return {
      height,
      shoulderWidth: reconcile('shoulderWidth', base.shoulderWidth),
      hipWidth: reconcile('hipWidth', base.hipWidth),
      trunkLength,
      upperArm: reconcile('upperArm', base.upperArm),
      forearm: reconcile('forearm', base.forearm),
      hand: reconcile('hand', base.hand),
      thigh,
      shin,
      foot: reconcile('foot', base.foot),
      headHeight: base.headHeight,
      neck: base.neck,
      // a body is only really measured once several parts agree over several
      // frames; before that the figure is mostly an assumption and the rest
      // of the app is entitled to know that
      confidence: Math.min(1, (measured / 7) * Math.min(1, this.frames / 20)),
    };
  }

  reset(): void {
    this.lengths = {};
    this.frames = 0;
  }
}
