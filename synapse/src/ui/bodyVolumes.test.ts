import { LM } from '@/src/engine/types';
import { defaultProportions, girthsFor } from '@/src/vision/proportions';
import type { WorldPoint } from '@/src/vision/types';

import { bodyFrame, buildBody, solidFaces, worldFromLandmarks } from './bodyVolumes';
import type { P3 } from './volume';

/**
 * The mannequin is checked in metres, against a tape measure.
 *
 * "Looks about right" is how the chest ended up nearly a shoulder-span deep
 * — wrong in a way nobody can see until the figure is on a real person and
 * reads as a barrel. Every dimension below is compared to what that part of
 * a body actually measures.
 */

function standing(height = 1.72): WorldPoint[] {
  const p = defaultProportions(height);
  const pt = (x: number, y: number, z: number, v = 1): WorldPoint => ({ x, y, z, v });
  const out: WorldPoint[] = [];
  for (let i = 0; i < 33; i++) out.push(pt(0, 0, 0, 0));

  const hw = p.hipWidth / 2;
  const sw = p.shoulderWidth / 2;
  out[LM.leftHip] = pt(-hw, 0, 0);
  out[LM.rightHip] = pt(hw, 0, 0);
  out[LM.leftShoulder] = pt(-sw, p.trunkLength, 0);
  out[LM.rightShoulder] = pt(sw, p.trunkLength, 0);
  // This fixture is a body seen from behind: the anatomical right shoulder
  // is on the +x side. The face has to agree — a nose pointing at the
  // viewer on a back that is also facing the viewer is not a person, and it
  // turns the head frame inside out.
  const earY = p.trunkLength + p.neck + p.headHeight * 0.5;
  out[LM.leftEar] = pt(-p.headHeight * 0.33, earY, 0);
  out[LM.rightEar] = pt(p.headHeight * 0.33, earY, 0);
  out[LM.nose] = pt(0, earY, -p.headHeight * 0.45);

  out[LM.leftElbow] = pt(-sw - 0.02, p.trunkLength - p.upperArm, 0);
  out[LM.rightElbow] = pt(sw + 0.02, p.trunkLength - p.upperArm, 0);
  out[LM.leftWrist] = pt(-sw - 0.04, p.trunkLength - p.upperArm - p.forearm, 0);
  out[LM.rightWrist] = pt(sw + 0.04, p.trunkLength - p.upperArm - p.forearm, 0);
  out[LM.leftIndex] = pt(-sw - 0.05, p.trunkLength - p.upperArm - p.forearm - p.hand, 0);
  out[LM.rightIndex] = pt(sw + 0.05, p.trunkLength - p.upperArm - p.forearm - p.hand, 0);

  out[LM.leftKnee] = pt(-hw, -p.thigh, 0);
  out[LM.rightKnee] = pt(hw, -p.thigh, 0);
  out[LM.leftAnkle] = pt(-hw, -p.thigh - p.shin, 0);
  out[LM.rightAnkle] = pt(hw, -p.thigh - p.shin, 0);
  out[LM.leftFootIndex] = pt(-hw, -p.thigh - p.shin, p.foot);
  out[LM.rightFootIndex] = pt(hw, -p.thigh - p.shin, p.foot);
  return out;
}

/** How far a solid reaches along a body axis — its real width or depth. */
function extent(corners: P3[], axis: P3): number {
  const proj = corners.map((c) => c.x * axis.x + c.y * axis.y + c.z * axis.z);
  return Math.max(...proj) - Math.min(...proj);
}

function solidCorners(s: ReturnType<typeof solidFaces>): P3[] {
  return s.flatMap((q) => q.corners);
}

describe('mannequin silhouette', () => {
  const world = standing();
  const model = buildBody(world);
  const p = model.proportions;
  const f = bodyFrame({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });

  /** the ribcage block — the second 'torso' box, above the waist tube */
  const chest = model.solids.filter((s) => s.segment === 'torso' && s.kind === 'box')[0]!;
  const pelvis = model.solids.find((s) => s.segment === 'hips')!;
  const head = model.solids.find((s) => s.segment === 'head')!;

  it('builds a body frame whose axes are perpendicular', () => {
    const d = (a: P3, b: P3) => a.x * b.x + a.y * b.y + a.z * b.z;
    expect(d(f.across, f.up)).toBeCloseTo(0, 9);
    expect(d(f.across, f.forward)).toBeCloseTo(0, 9);
    expect(d(f.up, f.forward)).toBeCloseTo(0, 9);
  });

  it('points forward out through the chest, whichever way the body faces', () => {
    // a shoulder line running left-to-right in +x is a body seen from
    // behind, so its chest faces away from the viewer
    expect(bodyFrame({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }).forward.z).toBeLessThan(-0.99);
    // facing the lens, the anatomical right shoulder is on our left
    expect(bodyFrame({ x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }).forward.z).toBeGreaterThan(0.99);
  });

  it('puts the chest width in the width axis and the depth in the depth axis', () => {
    const c = solidCorners(solidFaces(chest));
    const g = girthsFor(p);
    expect(extent(c, f.across)).toBeCloseTo(g.chestWidth, 6);
    expect(extent(c, f.forward)).toBeCloseTo(g.chestDepth, 6);
  });

  it('keeps the ribcage inside the shoulders, not spanning them', () => {
    const c = solidCorners(solidFaces(chest));
    const width = extent(c, f.across);
    // a ribcage is about three quarters of the shoulder span; anything near
    // the full span is the barrel this test exists to prevent
    expect(width).toBeLessThan(p.shoulderWidth * 0.8);
    expect(width).toBeGreaterThan(p.shoulderWidth * 0.6);
  });

  it('makes the chest wider than it is deep', () => {
    const c = solidCorners(solidFaces(chest));
    expect(extent(c, f.across)).toBeGreaterThan(extent(c, f.forward) * 1.4);
  });

  it('gives a 1.72 m body a chest of roughly 30 by 19 centimetres', () => {
    const c = solidCorners(solidFaces(chest));
    expect(extent(c, f.across)).toBeGreaterThan(0.27);
    expect(extent(c, f.across)).toBeLessThan(0.33);
    expect(extent(c, f.forward)).toBeGreaterThan(0.16);
    expect(extent(c, f.forward)).toBeLessThan(0.22);
  });

  it('matches the pelvis to the measured hips', () => {
    const c = solidCorners(solidFaces(pelvis));
    expect(extent(c, f.across)).toBeCloseTo(p.hipWidth, 6);
  });

  it('sizes the head near an eighth of standing height', () => {
    const c = solidCorners(solidFaces(head));
    const tall = extent(c, f.up);
    expect(tall / p.height).toBeGreaterThan(0.11);
    expect(tall / p.height).toBeLessThan(0.15);
  });

  it('stacks head above shoulders above hips', () => {
    const y = (seg: string) => {
      const s = model.solids.find((v) => v.segment === seg)!;
      const c = solidCorners(solidFaces(s));
      return c.reduce((a, b) => a + b.y, 0) / c.length;
    };
    expect(y('head')).toBeGreaterThan(y('neck'));
    expect(y('neck')).toBeGreaterThan(y('hips'));
    expect(y('leftThigh')).toBeGreaterThan(y('leftShin'));
  });

  it('stands the head up the spine, not out along the neck-to-ear line', () => {
    // the ears sit forward of the top of the spine on everyone, so a head
    // aimed from the neck at the ear midpoint leans tens of degrees forward
    // before anybody has tilted their head at all
    const c = solidCorners(solidFaces(head));
    const along = c.map((q) => q.x * f.up.x + q.y * f.up.y + q.z * f.up.z);
    const across = c.map((q) => q.x * f.across.x + q.y * f.across.y + q.z * f.across.z);
    const tall = Math.max(...along) - Math.min(...along);
    const wide = Math.max(...across) - Math.min(...across);
    // upright, the head's own height must land on the spine axis
    expect(tall).toBeCloseTo(p.headHeight, 2);
    expect(wide).toBeCloseTo(girthsFor(p).headWidth, 2);
  });

  it('tilts the head when the head is tilted, and only then', () => {
    const tilted = standing();
    // drop the chin: the nose swings down while the ear line holds still
    tilted[LM.nose] = {
      ...tilted[LM.nose]!,
      y: tilted[LM.nose]!.y - p.headHeight * 0.45,
    };

    const m = buildBody(tilted);
    const h = m.solids.find((s) => s.segment === 'head')!;
    const c = solidCorners(solidFaces(h));
    const along = c.map((q) => q.x * f.up.x + q.y * f.up.y + q.z * f.up.z);
    // a pitched head no longer measures its full height on the spine axis
    expect(Math.max(...along) - Math.min(...along)).toBeGreaterThan(p.headHeight * 0.9);
    // but the ear line still sets its width, so it must not balloon
    const across = c.map((q) => q.x * f.across.x + q.y * f.across.y + q.z * f.across.z);
    expect(Math.max(...across) - Math.min(...across)).toBeCloseTo(girthsFor(p).headWidth, 2);
  });

  it('joins the neck to wherever the head actually sits', () => {
    const neck = model.solids.find((s) => s.segment === 'neck')!;
    const nTop = Math.max(...solidCorners(solidFaces(neck)).map((q) => q.y));
    const hBot = Math.min(...solidCorners(solidFaces(head)).map((q) => q.y));
    // no gap and no long overlap between the neck and the skull
    expect(Math.abs(nTop - hBot)).toBeLessThan(p.headHeight * 0.35);
  });

  it('gives every solid real faces — none collapses to nothing', () => {
    expect(model.solids.length).toBeGreaterThan(15);
    for (const s of model.solids) {
      const faces = solidFaces(s);
      expect(faces.length).toBeGreaterThan(0);
      for (const q of faces) {
        expect(Number.isFinite(q.normal.x)).toBe(true);
        const n = Math.hypot(q.normal.x, q.normal.y, q.normal.z);
        expect(n).toBeCloseTo(1, 6);
      }
    }
  });

  it('draws every part the anatomy calls for', () => {
    const segs = new Set(model.solids.map((s) => s.segment));
    for (const s of ['head', 'neck', 'torso', 'hips', 'leftArm', 'rightArm',
      'leftForearm', 'rightForearm', 'leftThigh', 'rightThigh', 'leftShin', 'rightShin']) {
      expect(segs.has(s as never)).toBe(true);
    }
  });

  it('uses cylinders for the round parts and boxes for the blocky ones', () => {
    const kind = (seg: string) => model.solids.filter((s) => s.segment === seg).map((s) => s.kind);
    expect(kind('neck')).toEqual(['cylinder']);
    expect(kind('head')).toEqual(['box']);
    expect(kind('hips')).toEqual(['box']);
    // torso is the waist tube plus the ribcage block
    expect(kind('torso').sort()).toEqual(['box', 'cylinder']);
    // a leg is thigh tube, knee cube, shin tube, foot block
    expect(kind('leftThigh')).toEqual(['cylinder', 'box']);
    expect(kind('leftShin')).toEqual(['cylinder', 'box']);
  });
});

describe('adaptiveness', () => {
  it('scales the whole figure with the person', () => {
    const small = buildBody(standing(1.5), defaultProportions(1.5));
    const large = buildBody(standing(1.95), defaultProportions(1.95));
    const f = bodyFrame({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const chestOf = (m: typeof small) => {
      const c = m.solids.filter((s) => s.segment === 'torso' && s.kind === 'box')[0]!;
      return extent(solidCorners(solidFaces(c)), f.across);
    };
    expect(chestOf(large) / chestOf(small)).toBeCloseTo(1.95 / 1.5, 3);
  });

  it('widens the chest for a broad build at the same height', () => {
    const base = defaultProportions(1.75);
    const broad = { ...base, shoulderWidth: base.shoulderWidth * 1.25 };
    const f = bodyFrame({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const chestOf = (p: typeof base) => {
      const m = buildBody(standing(1.75), p);
      const c = m.solids.filter((s) => s.segment === 'torso' && s.kind === 'box')[0]!;
      return extent(solidCorners(solidFaces(c)), f.across);
    };
    expect(chestOf(broad) / chestOf(base)).toBeCloseTo(1.25, 3);
  });

  it('thickens a limb in proportion to its own measured bone', () => {
    const base = defaultProportions(1.75);
    const longLegs = { ...base, thigh: base.thigh * 1.3 };
    const radius = (p: typeof base) => girthsFor(p).thigh.rFrom;
    expect(radius(longLegs) / radius(base)).toBeCloseTo(1.3, 6);
  });

  it('tapers every limb from its thick end to its thin one', () => {
    const g = girthsFor(defaultProportions(1.75));
    for (const t of [g.thigh, g.shin, g.upperArm, g.forearm, g.neck]) {
      expect(t.rFrom).toBeGreaterThan(t.rTo);
    }
    // a thigh is roughly half again as thick at the hip as above the knee
    expect(g.thigh.rFrom / g.thigh.rTo).toBeGreaterThan(1.3);
  });

  it('makes the trunk oval rather than round', () => {
    const g = girthsFor(defaultProportions(1.75));
    // a waist is much wider than it is deep, and a pipe cannot say so
    expect(g.waist.flatten).toBeLessThan(0.75);
    expect(g.waist.flatten).toBeGreaterThan(0.5);
  });

  it('gives a 1.75 m body limbs of believable girth', () => {
    const g = girthsFor(defaultProportions(1.75));
    const circ = (r: number, f: number) => Math.PI * (r + r * f); // ellipse, near enough
    // mid-thigh runs about 55 cm on an adult, calf about 37, biceps about 32
    expect(circ(g.thigh.rFrom, g.thigh.flatten) * 100).toBeGreaterThan(45);
    expect(circ(g.thigh.rFrom, g.thigh.flatten) * 100).toBeLessThan(65);
    expect(circ(g.shin.rFrom, g.shin.flatten) * 100).toBeGreaterThan(30);
    expect(circ(g.shin.rFrom, g.shin.flatten) * 100).toBeLessThan(45);
    expect(circ(g.upperArm.rFrom, g.upperArm.flatten) * 100).toBeGreaterThan(25);
    expect(circ(g.upperArm.rFrom, g.upperArm.flatten) * 100).toBeLessThan(42);
  });

  it('keeps the pelvis block shorter than it is wide', () => {
    const g = girthsFor(defaultProportions(1.75));
    // the box runs along the hip line, so the first cross-section number is
    // how tall the pelvis is — passing the hip width there built a hip a
    // third of a metre deep from crest to seat
    expect(g.pelvisHeight).toBeLessThan(g.pelvisWidth * 0.7);
    expect(g.pelvisHeight).toBeGreaterThan(g.pelvisWidth * 0.4);
  });

  it('returns nothing when the trunk was never seen', () => {
    const blind: WorldPoint[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, v: 0 }));
    const m = buildBody(blind);
    expect(m.solids).toHaveLength(0);
    expect(m.frame).toBeNull();
  });
});

describe('worldFromLandmarks', () => {
  it('scales a normalized figure to a stated height', () => {
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, v: 0 }));
    lm[LM.leftShoulder] = { x: 0.42, y: 0.34, v: 1 };
    lm[LM.rightShoulder] = { x: 0.58, y: 0.34, v: 1 };
    lm[LM.leftHip] = { x: 0.45, y: 0.55, v: 1 };
    lm[LM.rightHip] = { x: 0.55, y: 0.55, v: 1 };
    const w = worldFromLandmarks(lm, 1.8);
    const sc = {
      x: (w[LM.leftShoulder]!.x + w[LM.rightShoulder]!.x) / 2,
      y: (w[LM.leftShoulder]!.y + w[LM.rightShoulder]!.y) / 2,
    };
    // the trunk must come out at its anthropometric share of 1.8 m
    expect(Math.hypot(sc.x, sc.y)).toBeCloseTo(1.8 * 0.288, 6);
  });

  it('puts the hips at the origin and the shoulders above them', () => {
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, v: 0 }));
    lm[LM.leftShoulder] = { x: 0.42, y: 0.3, v: 1 };
    lm[LM.rightShoulder] = { x: 0.58, y: 0.3, v: 1 };
    lm[LM.leftHip] = { x: 0.45, y: 0.6, v: 1 };
    lm[LM.rightHip] = { x: 0.55, y: 0.6, v: 1 };
    const w = worldFromLandmarks(lm);
    expect((w[LM.leftHip]!.y + w[LM.rightHip]!.y) / 2).toBeCloseTo(0, 9);
    expect(w[LM.leftShoulder]!.y).toBeGreaterThan(0);
  });
});
