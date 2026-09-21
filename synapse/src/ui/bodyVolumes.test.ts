import { RigCalibration, rigBodyState, rigLandmarks } from '@/src/engine/rigBody';
import { parseRigPayload } from '@/src/sources/udp/protocol';

import { bodyVolumes, toBody } from './bodyVolumes';
import { DEFAULT_CAMERA, faceDepth, project } from './volume';

/**
 * Rig packet → body model → solids → pixels, in one pass.
 *
 * Everything here fails silently on a device: a figure projected off the edge
 * of the screen, a body two pixels tall, a forearm drawn as though the
 * hardware knew where it was. The browser preview cannot reach this path —
 * the solids only render when a Rig is drawing the body — so this is the
 * check that stands in for looking at it.
 */

const W = 390;
const H = 780;

/** A mid-squat frame in the form the firmware sends today. */
function squatFrame() {
  const packet = JSON.stringify({
    back: [0.9624, 0.2715, 0, 0],
    leftArm: [0.9779, 0.1037, 0, -0.1815],
    leftLeg: [0.9655, -0.2257, 0, -0.1296],
    rightArm: [0.9779, 0.1037, 0, 0.1815],
    rightLeg: [0.9655, -0.2257, 0, 0.1296],
  });
  const frame = parseRigPayload(packet, 1000)!;
  expect(frame).not.toBeNull();
  return rigLandmarks(rigBodyState(frame, new RigCalibration()));
}

describe('a real Rig packet becomes a drawable body', () => {
  const lm = squatFrame();
  const vols = bodyVolumes(lm);

  it('builds a whole body, not a handful of pieces', () => {
    const segments = vols.map((v) => v.segment);
    for (const required of ['torso', 'hips', 'head', 'leftThigh', 'rightThigh', 'leftArm', 'rightArm']) {
      expect(segments).toContain(required);
    }
  });

  it('marks what no sensor covers, and only that', () => {
    const inferred = vols.filter((v) => v.inferred).map((v) => v.segment).sort();
    // there is no IMU below the elbow or the knee
    expect(inferred).toEqual(['leftForearm', 'leftShin', 'rightForearm', 'rightShin']);
    // and the segments that are measured must not be marked as guesses
    for (const s of ['torso', 'leftThigh', 'rightThigh', 'leftArm']) {
      expect(vols.find((v) => v.segment === s)!.inferred).toBe(false);
    }
  });

  it('gives every solid six faces with four corners each', () => {
    for (const v of vols) {
      expect(v.quads).toHaveLength(6);
      for (const q of v.quads) expect(q.corners).toHaveLength(4);
    }
  });

  it('lands the whole figure on the canvas', () => {
    const pts = vols.flatMap((v) => v.quads.flatMap((q) => q.corners.map((c) => project(c, DEFAULT_CAMERA, W, H))));
    expect(pts.every((p) => p.visible)).toBe(true);
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(-W * 0.5);
      expect(p.x).toBeLessThan(W * 1.5);
      expect(p.y).toBeGreaterThan(-H * 0.5);
      expect(p.y).toBeLessThan(H * 1.5);
    }
  });

  it('fills a useful part of the frame — neither a speck nor overflowing', () => {
    const ys = vols.flatMap((v) => v.quads.flatMap((q) => q.corners.map((c) => project(c, DEFAULT_CAMERA, W, H).y)));
    const span = Math.max(...ys) - Math.min(...ys);
    // it measured 0.28 before the camera was tuned to a real body — a figure
    // adrift in an empty screen, which nothing else here would have caught
    expect(span / H).toBeGreaterThan(0.45);
    expect(span / H).toBeLessThan(0.95);
  });

  it('stands the right way up', () => {
    const top = (seg: string) =>
      Math.min(
        ...vols.find((v) => v.segment === seg)!.quads.flatMap((q) => q.corners.map((c) => project(c, DEFAULT_CAMERA, W, H).y)),
      );
    // screen y grows downward: the head is above the hips, the hips above the shins
    expect(top('head')).toBeLessThan(top('hips'));
    expect(top('hips')).toBeLessThan(top('leftShin'));
  });

  it('separates left from right, so a one-sided fault has somewhere to show', () => {
    const cx = (seg: string) => {
      const p = vols.find((v) => v.segment === seg)!.quads.flatMap((q) => q.corners.map((c) => project(c, DEFAULT_CAMERA, W, H).x));
      return p.reduce((a, b) => a + b, 0) / p.length;
    };
    expect(Math.abs(cx('leftThigh') - cx('rightThigh'))).toBeGreaterThan(8);
  });

  it('carries depth, which is the entire reason this view exists', () => {
    // the trunk inclines forward in a squat, so its ends sit at different
    // distances from the eye; a flat figure would give one depth for both
    const torso = vols.find((v) => v.segment === 'torso')!;
    const depths = torso.quads.map((q) => faceDepth(q, DEFAULT_CAMERA));
    expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(0.01);
  });

  it('degrades to what it has when nodes drop out', () => {
    const partial = parseRigPayload(JSON.stringify({ back: [1, 0, 0, 0] }), 1000)!;
    const vs = bodyVolumes(rigLandmarks(rigBodyState(partial, new RigCalibration())));
    // a trunk alone still draws a trunk; nothing throws for the missing limbs
    expect(vs.map((v) => v.segment)).toContain('torso');
    expect(vs.length).toBeGreaterThan(0);
  });
});

describe('landmark space to body space', () => {
  it('centres the body and flips y to point up', () => {
    const centre = toBody({ x: 0.5, y: 0.5, v: 1 });
    expect(centre.x).toBeCloseTo(0, 10);
    expect(centre.y).toBeCloseTo(0, 10);
    const lower = toBody({ x: 0.5, y: 0.9, v: 1 });
    expect(lower.y).toBeLessThan(0);
  });

  it('treats a missing z as the mid-plane rather than as a hole', () => {
    expect(toBody({ x: 0.5, y: 0.5, v: 1 }).z).toBe(0);
  });
});
