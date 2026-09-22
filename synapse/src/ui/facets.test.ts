import { LM } from '@/src/engine/types';
import { cameraProjector, focalFromFov, type FittedCamera } from '@/src/vision/cameraFit';
import { defaultProportions } from '@/src/vision/proportions';
import type { WorldPoint } from '@/src/vision/types';

import { buildBody } from './bodyVolumes';
import { buildFacets, litColor, OVERLAY_STYLES } from './facets';
import { DEFAULT_CAMERA, perspectiveProjector } from './volume';

const FRAME = { width: 720, height: 1280 };

function standing(height = 1.75): WorldPoint[] {
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
  out[LM.leftEar] = pt(-0.07, p.trunkLength + p.neck + p.headHeight * 0.5, 0);
  out[LM.rightEar] = pt(0.07, p.trunkLength + p.neck + p.headHeight * 0.5, 0);
  out[LM.nose] = pt(0, p.trunkLength + p.neck + p.headHeight * 0.5, -0.1);
  out[LM.leftElbow] = pt(-sw - 0.02, p.trunkLength - p.upperArm, 0);
  out[LM.rightElbow] = pt(sw + 0.02, p.trunkLength - p.upperArm, 0);
  out[LM.leftWrist] = pt(-sw - 0.03, p.trunkLength - p.upperArm - p.forearm, 0);
  out[LM.rightWrist] = pt(sw + 0.03, p.trunkLength - p.upperArm - p.forearm, 0);
  out[LM.leftKnee] = pt(-hw, -p.thigh, 0);
  out[LM.rightKnee] = pt(hw, -p.thigh, 0);
  out[LM.leftAnkle] = pt(-hw, -p.thigh - p.shin, 0);
  out[LM.rightAnkle] = pt(hw, -p.thigh - p.shin, 0);
  out[LM.leftFootIndex] = pt(-hw, -p.thigh - p.shin, 0.16);
  out[LM.rightFootIndex] = pt(hw, -p.thigh - p.shin, 0.16);
  return out;
}

const camera: FittedCamera = {
  focal: focalFromFov(FRAME.width, 65),
  cx: FRAME.width / 2,
  cy: FRAME.height / 2,
  distance: 3,
  tx: 0,
  ty: 0,
  residual: 0,
  used: 12,
  frame: FRAME,
};

const OPTS = { fill: 0.34, edge: 0.8, lineScale: 1, lightWith: null };

function facetsOf(severity = {}, opts = OPTS) {
  const model = buildBody(standing());
  return buildFacets(model.solids, cameraProjector(camera), severity, opts);
}

describe('buildFacets', () => {
  it('produces a face list for a whole body', () => {
    const f = facetsOf();
    expect(f.length).toBeGreaterThan(80);
    for (const q of f) {
      expect(q.pts.length).toBeGreaterThanOrEqual(3);
      for (const p of q.pts) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    }
  });

  it('orders faces furthest first, so near ones paint over far ones', () => {
    const f = facetsOf();
    for (let i = 1; i < f.length; i++) {
      expect(f[i - 1]!.depth).toBeGreaterThanOrEqual(f[i]!.depth);
    }
  });

  it('drops the faces turned away from the lens', () => {
    const model = buildBody(standing());
    const all = model.solids.reduce((n, s) => n + (s.kind === 'box' ? 6 : 18), 0);
    // roughly half of a closed solid faces away from any given viewpoint
    expect(facetsOf().length).toBeLessThan(all * 0.7);
  });

  it('carries the segment each face belongs to', () => {
    const segs = new Set(facetsOf().map((f) => f.segment));
    for (const s of ['head', 'neck', 'torso', 'hips', 'leftThigh', 'rightShin']) {
      expect(segs.has(s as never)).toBe(true);
    }
  });

  it('tints only the segment that is at fault', () => {
    const f = facetsOf({ leftThigh: 1 });
    const faulted = f.filter((q) => q.segment === 'leftThigh');
    const clean = f.filter((q) => q.segment === 'rightThigh');
    expect(faulted.length).toBeGreaterThan(0);
    expect(new Set(faulted.map((q) => q.stroke)).size).toBeGreaterThan(0);
    // a faulted part is meant to be findable across a room
    expect(faulted[0]!.strokeWidth).toBeGreaterThan(clean[0]!.strokeWidth);
    expect(faulted[0]!.stroke).not.toEqual(clean[0]!.stroke);
  });

  it('draws a part nothing measured more faintly than the rest', () => {
    const world = standing();
    const model = buildBody(world);
    const inferred = model.solids.map((s) => ({ ...s, inferred: true }));
    const dim = buildFacets(inferred, cameraProjector(camera), {}, OPTS);
    const solid = facetsOf();
    const alphaOf = (c: string | null) => Number(c!.match(/([\d.]+)\)$/)![1]);
    expect(alphaOf(dim[0]!.fill)).toBeLessThan(alphaOf(solid[0]!.fill));
  });

  it('omits the fill entirely in contour style', () => {
    const f = facetsOf({}, { ...OPTS, fill: 0 });
    expect(f.every((q) => q.fill === null)).toBe(true);
    expect(f.every((q) => q.stroke !== null)).toBe(true);
  });

  it('omits the stroke entirely when only a silhouette is wanted', () => {
    const f = facetsOf({}, { ...OPTS, edge: 0 });
    expect(f.every((q) => q.stroke === null)).toBe(true);
  });

  it('scales line weight with the canvas', () => {
    const thin = facetsOf({}, { ...OPTS, lineScale: 1 });
    const thick = facetsOf({}, { ...OPTS, lineScale: 3 });
    expect(thick[0]!.strokeWidth / thin[0]!.strokeWidth).toBeCloseTo(3, 6);
  });

  it('shades faces differently, so a solid reads as a solid', () => {
    const lit = new Set(facetsOf().map((q) => q.fill));
    expect(lit.size).toBeGreaterThan(5);
  });

  it('works through the studio camera as well as a fitted one', () => {
    const model = buildBody(standing());
    const f = buildFacets(
      model.solids,
      perspectiveProjector(DEFAULT_CAMERA, 400, 800),
      {},
      { ...OPTS, lightWith: DEFAULT_CAMERA },
    );
    expect(f.length).toBeGreaterThan(80);
  });

  it('returns nothing rather than throwing for an empty body', () => {
    expect(buildFacets([], cameraProjector(camera), {}, OPTS)).toEqual([]);
  });
});

describe('litColor', () => {
  it('reads both hex and rgb inputs', () => {
    expect(litColor('#8040C0', 1, 1)).toBe('rgba(128, 64, 192, 1)');
    expect(litColor('rgb(10, 20, 30)', 1, 0.5)).toBe('rgba(10, 20, 30, 0.5)');
  });

  it('clamps a brightened colour instead of wrapping it', () => {
    expect(litColor('#FFFFFF', 4, 1)).toBe('rgba(255, 255, 255, 1)');
  });

  it('darkens by the lighting factor', () => {
    expect(litColor('#808080', 0.5, 1)).toBe('rgba(64, 64, 64, 1)');
  });
});

describe('overlay styles', () => {
  it('offers a filled, a heavier filled and an unfilled reading', () => {
    expect(OVERLAY_STYLES.contour.fill).toBe(0);
    expect(OVERLAY_STYLES.study.fill).toBeGreaterThan(OVERLAY_STYLES.solid.fill);
  });

  it('dims the background more the more opaque the figure is', () => {
    expect(OVERLAY_STYLES.study.scrim).toBeGreaterThan(OVERLAY_STYLES.solid.scrim);
    expect(OVERLAY_STYLES.solid.scrim).toBeGreaterThan(OVERLAY_STYLES.contour.scrim);
  });

  it('never dims so far that the lifter cannot see themselves', () => {
    for (const s of Object.values(OVERLAY_STYLES)) {
      expect(s.scrim).toBeLessThan(0.7);
      expect(s.fill).toBeLessThan(0.75);
    }
  });
});
