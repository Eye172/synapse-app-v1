import { LM } from '@/src/engine/types';

import { BodyMeasure, defaultProportions, girthsFor, type BodyProportions } from './proportions';
import type { WorldPoint } from './types';

/**
 * The figure has two duties that pull against each other: be this person's
 * body, and be a possible body. These check that neither wins outright —
 * that a genuinely broad lifter is drawn broad, and that a detector having
 * a bad frame cannot draw a forearm longer than an arm.
 */

interface Build {
  height?: number;
  /** multiply one named measurement, to model a build or a bad reading */
  stretch?: Partial<Record<keyof BodyProportions, number>>;
}

/** A skeleton posed as a plain standing body, optionally reshaped. */
function bodyOf({ height = 1.75, stretch = {} }: Build = {}): WorldPoint[] {
  const base = defaultProportions(height);
  const p = { ...base };
  for (const [k, mul] of Object.entries(stretch)) {
    (p as unknown as Record<string, number>)[k] =
      (base as unknown as Record<string, number>)[k]! * (mul as number);
  }
  const pt = (x: number, y: number, z: number, v = 1): WorldPoint => ({ x, y, z, v });
  const out: WorldPoint[] = [];
  for (let i = 0; i < 33; i++) out.push(pt(0, 0, 0, 0));
  const hw = p.hipWidth / 2;
  const sw = p.shoulderWidth / 2;
  out[LM.leftHip] = pt(-hw, 0, 0);
  out[LM.rightHip] = pt(hw, 0, 0);
  out[LM.leftShoulder] = pt(-sw, p.trunkLength, 0);
  out[LM.rightShoulder] = pt(sw, p.trunkLength, 0);
  out[LM.leftElbow] = pt(-sw, p.trunkLength - p.upperArm, 0);
  out[LM.rightElbow] = pt(sw, p.trunkLength - p.upperArm, 0);
  out[LM.leftWrist] = pt(-sw, p.trunkLength - p.upperArm - p.forearm, 0);
  out[LM.rightWrist] = pt(sw, p.trunkLength - p.upperArm - p.forearm, 0);
  out[LM.leftIndex] = pt(-sw, p.trunkLength - p.upperArm - p.forearm - p.hand, 0);
  out[LM.rightIndex] = pt(sw, p.trunkLength - p.upperArm - p.forearm - p.hand, 0);
  out[LM.leftKnee] = pt(-hw, -p.thigh, 0);
  out[LM.rightKnee] = pt(hw, -p.thigh, 0);
  out[LM.leftAnkle] = pt(-hw, -p.thigh - p.shin, 0);
  out[LM.rightAnkle] = pt(hw, -p.thigh - p.shin, 0);
  out[LM.leftHeel] = pt(-hw, -p.thigh - p.shin, -p.foot * 0.35);
  out[LM.rightHeel] = pt(hw, -p.thigh - p.shin, -p.foot * 0.35);
  out[LM.leftFootIndex] = pt(-hw, -p.thigh - p.shin, p.foot * 0.65);
  out[LM.rightFootIndex] = pt(hw, -p.thigh - p.shin, p.foot * 0.65);
  return out;
}

function watch(build: Build, frames = 40): BodyProportions {
  const m = new BodyMeasure();
  const body = bodyOf(build);
  for (let i = 0; i < frames; i++) m.observe(body);
  return m.proportions;
}

describe('measuring a body', () => {
  it('recovers a textbook body almost exactly', () => {
    const p = watch({ height: 1.75 });
    const t = defaultProportions(1.75);
    expect(p.height).toBeCloseTo(1.75, 2);
    for (const k of ['shoulderWidth', 'hipWidth', 'trunkLength', 'upperArm', 'forearm', 'thigh', 'shin'] as const) {
      expect(p[k] / t[k]).toBeCloseTo(1, 2);
    }
  });

  it.each([1.45, 1.6, 1.75, 1.9, 2.05])('scales to a %p m person', (h) => {
    const p = watch({ height: h });
    expect(p.height).toBeCloseTo(h, 1);
    expect(p.thigh / p.height).toBeCloseTo(defaultProportions(h).thigh / h, 2);
  });

  it('keeps most of a genuinely broad build', () => {
    const p = watch({ stretch: { shoulderWidth: 1.2 } });
    const ratio = p.shoulderWidth / (p.height * 0.245);
    // a fifth broader than average stays clearly broader than average
    expect(ratio).toBeGreaterThan(1.12);
    expect(ratio).toBeLessThan(1.2);
  });

  it('keeps a genuinely long-legged build', () => {
    const p = watch({ stretch: { thigh: 1.15, shin: 1.15 } });
    expect(p.thigh / p.shin).toBeCloseTo(defaultProportions(1.75).thigh / defaultProportions(1.75).shin, 1);
    // long legs push the estimated height up rather than being flattened out
    expect(p.height).toBeGreaterThan(1.8);
  });

  it('reins in a bone the detector doubled', () => {
    const p = watch({ stretch: { forearm: 2.0 } });
    const expected = p.height * 0.146;
    // believed in part, not in full: nowhere near twice as long
    expect(p.forearm / expected).toBeLessThan(1.3);
    expect(p.forearm / expected).toBeGreaterThan(1.0);
    // and never longer than the arm above it, which no body is
    expect(p.forearm).toBeLessThan(p.upperArm);
  });

  it('reins in a bone the detector halved', () => {
    const p = watch({ stretch: { thigh: 0.45 } });
    const expected = p.height * 0.245;
    expect(p.thigh / expected).toBeGreaterThan(0.75);
    expect(p.thigh / expected).toBeLessThan(1.0);
  });

  it('leans on anatomy until it has watched enough frames', () => {
    const early = watch({ stretch: { shoulderWidth: 1.4 } }, 2);
    const late = watch({ stretch: { shoulderWidth: 1.4 } }, 60);
    const ratio = (p: BodyProportions) => p.shoulderWidth / (p.height * 0.245);
    // two frames is not evidence about a body; sixty is
    expect(ratio(early)).toBeLessThan(ratio(late));
    expect(ratio(early)).toBeCloseTo(1, 1);
  });

  it('has no opinion at all before it sees anybody', () => {
    const m = new BodyMeasure();
    expect(m.proportions.confidence).toBe(0);
    expect(m.proportions.height).toBeCloseTo(1.72, 6);
  });

  it('never returns a proportion that is zero, negative or not a number', () => {
    for (const build of [
      {}, { height: 1.4 }, { height: 2.1 },
      { stretch: { forearm: 4 } }, { stretch: { trunkLength: 0.2 } },
      { stretch: { hipWidth: 3 } },
    ] as Build[]) {
      const p = watch(build);
      for (const [k, v] of Object.entries(p)) {
        if (k === 'confidence') continue;
        expect(Number.isFinite(v as number)).toBe(true);
        expect(v as number).toBeGreaterThan(0);
      }
    }
  });

  it('is not fooled by a limb that is only ever seen foreshortened', () => {
    const m = new BodyMeasure();
    const square = bodyOf();
    const turned = square.map((w, i) =>
      i === LM.leftKnee || i === LM.rightKnee ? { ...w, y: w.y * 0.4 } : w,
    );
    for (let i = 0; i < 30; i++) m.observe(i < 5 ? square : turned);
    // one clear look is enough; the rest cannot take length away
    expect(m.proportions.thigh).toBeCloseTo(defaultProportions(1.75).thigh, 2);
  });
});

describe('girths from proportions', () => {
  it('follows the person, not a constant', () => {
    const small = girthsFor(defaultProportions(1.5));
    const large = girthsFor(defaultProportions(2.0));
    expect(large.chestWidth / small.chestWidth).toBeCloseTo(2.0 / 1.5, 6);
    expect(large.thigh.rFrom / small.thigh.rFrom).toBeCloseTo(2.0 / 1.5, 6);
  });

  it('keeps the ribcage inside the shoulders at every size', () => {
    for (const h of [1.4, 1.6, 1.8, 2.0]) {
      const p = defaultProportions(h);
      expect(girthsFor(p).chestWidth).toBeLessThan(p.shoulderWidth * 0.8);
    }
  });

  it('never lets a limb be wider than the trunk it hangs off', () => {
    for (const h of [1.4, 1.75, 2.05]) {
      const p = defaultProportions(h);
      const g = girthsFor(p);
      expect(g.thigh.rFrom * 2).toBeLessThan(g.chestWidth);
      expect(g.upperArm.rFrom * 2).toBeLessThan(g.chestWidth);
    }
  });

  it('stays sane for a body measured badly at every joint', () => {
    const p = watch({ stretch: { shoulderWidth: 2.5, thigh: 0.3, forearm: 3 } });
    const g = girthsFor(p);
    for (const v of [g.chestWidth, g.chestDepth, g.pelvisWidth, g.headWidth,
      g.thigh.rFrom, g.shin.rFrom, g.upperArm.rFrom, g.forearm.rFrom]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    // the chest may be broad, but not a metre across
    expect(g.chestWidth).toBeLessThan(p.height * 0.3);
  });
});
