import type { Landmark } from '@/src/engine/types';

import { cameraProjector, fitCamera, focalFromFov, type FittedCamera } from './cameraFit';
import type { FrameSize, WorldPoint } from './types';
import { containViewport, coverViewport } from './viewport';

/**
 * The camera solve is checked the only way a solve can honestly be checked:
 * by taking a camera we chose, projecting a body through it, and asking the
 * code to tell us which camera that was. If it cannot recover a camera it
 * was handed the exact output of, it will not recover a real one.
 */

const FRAME: FrameSize = { width: 720, height: 1280 };

/** A plausible standing skeleton in metres, hips at the origin, y up. */
function standingBody(): WorldPoint[] {
  const p = (x: number, y: number, z: number, v = 1): WorldPoint => ({ x, y, z, v });
  const out: WorldPoint[] = [];
  for (let i = 0; i < 33; i++) out.push(p(0, 0, 0, 0));
  out[0] = p(0, 0.62, 0.04); // nose
  out[7] = p(-0.07, 0.58, -0.02); // ears
  out[8] = p(0.07, 0.58, -0.02);
  out[11] = p(-0.21, 0.5, 0); // shoulders
  out[12] = p(0.21, 0.5, 0);
  out[13] = p(-0.25, 0.22, 0.02); // elbows
  out[14] = p(0.25, 0.22, 0.02);
  out[15] = p(-0.27, -0.03, 0.05); // wrists
  out[16] = p(0.27, -0.03, 0.05);
  out[23] = p(-0.16, 0, 0); // hips
  out[24] = p(0.16, 0, 0);
  out[25] = p(-0.17, -0.43, 0.01); // knees
  out[26] = p(0.17, -0.43, 0.01);
  out[27] = p(-0.17, -0.85, -0.02); // ankles
  out[28] = p(0.17, -0.85, -0.02);
  return out;
}

/** Push a metric body through a chosen camera to get the pixels it landed on. */
function shoot(body: WorldPoint[], cam: FittedCamera): Landmark[] {
  return body.map((w) => {
    const d = cam.distance - w.z;
    return {
      x: (cam.cx + (cam.focal * (w.x + cam.tx)) / d) / FRAME.width,
      y: (cam.cy - (cam.focal * (w.y + cam.ty)) / d) / FRAME.height,
      v: w.v,
    };
  });
}

function makeCamera(distance: number, tx: number, ty: number, hfov = 65): FittedCamera {
  return {
    focal: focalFromFov(FRAME.width, hfov),
    cx: FRAME.width / 2,
    cy: FRAME.height / 2,
    distance,
    tx,
    ty,
    residual: 0,
    used: 0,
    frame: FRAME,
  };
}

describe('fitCamera', () => {
  it('recovers a camera from its own projection', () => {
    const body = standingBody();
    const truth = makeCamera(3.2, 0.1, -0.05);
    const fit = fitCamera(body, shoot(body, truth), FRAME)!;

    expect(fit).not.toBeNull();
    expect(fit.distance).toBeCloseTo(truth.distance, 2);
    expect(fit.tx).toBeCloseTo(truth.tx, 3);
    expect(fit.ty).toBeCloseTo(truth.ty, 3);
    expect(fit.residual).toBeLessThan(0.5);
  });

  it.each([1.4, 2.5, 4.0, 7.5])('recovers distance %p m', (distance) => {
    const body = standingBody();
    const truth = makeCamera(distance, 0, 0);
    const fit = fitCamera(body, shoot(body, truth), FRAME)!;
    // within a centimetre at arm's length, within a percent across the room
    expect(Math.abs(fit.distance - distance) / distance).toBeLessThan(0.01);
  });

  it('places a body that stands off to one side', () => {
    const body = standingBody();
    const truth = makeCamera(2.6, -0.55, 0.2);
    const fit = fitCamera(body, shoot(body, truth), FRAME)!;
    expect(fit.tx).toBeCloseTo(-0.55, 2);
    expect(fit.ty).toBeCloseTo(0.2, 2);
  });

  it('survives landmark noise without moving the camera much', () => {
    const body = standingBody();
    const truth = makeCamera(3.0, 0, 0);
    const clean = shoot(body, truth);
    // a few pixels of detector jitter on every point
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648 - 0.5;
    };
    const noisy = clean.map((l) => ({
      ...l,
      x: l.x + (rand() * 6) / FRAME.width,
      y: l.y + (rand() * 6) / FRAME.height,
    }));
    const fit = fitCamera(body, noisy, FRAME)!;
    expect(Math.abs(fit.distance - 3.0)).toBeLessThan(0.1);
  });

  it('is not dragged off by one wildly misplaced joint', () => {
    const body = standingBody();
    const truth = makeCamera(3.0, 0, 0);
    const shots = shoot(body, truth);
    // the detector puts a wrist half a frame away from where it belongs
    shots[15] = { ...shots[15]!, x: 0.05, y: 0.95 };
    const fit = fitCamera(body, shots, FRAME)!;
    expect(Math.abs(fit.distance - 3.0)).toBeLessThan(0.25);
  });

  it('refuses to guess from too few points', () => {
    const body = standingBody();
    const truth = makeCamera(3.0, 0, 0);
    const shots = shoot(body, truth);
    const sparse = body.map((w, i) => ({ ...w, v: i === 11 || i === 12 ? 1 : 0 }));
    expect(fitCamera(sparse, shots, FRAME)).toBeNull();
  });

  it('gives back the pixels it was fitted to', () => {
    const body = standingBody();
    const truth = makeCamera(2.2, 0.08, 0.03);
    const shots = shoot(body, truth);
    const fit = fitCamera(body, shots, FRAME)!;
    const proj = cameraProjector(fit);

    for (const i of [11, 12, 23, 24, 25, 26, 27, 28]) {
      const got = proj.to2D(body[i]!);
      expect(got.visible).toBe(true);
      expect(got.x).toBeCloseTo(shots[i]!.x * FRAME.width, 0);
      expect(got.y).toBeCloseTo(shots[i]!.y * FRAME.height, 0);
    }
  });
});

describe('cameraProjector', () => {
  it('applies a real perspective divide, not a flat scale', () => {
    const cam = makeCamera(2.0, 0, 0);
    const proj = cameraProjector(cam);
    // two points the same distance off-axis, one half a metre nearer
    const far = proj.to2D({ x: 0.2, y: 0, z: -0.25 });
    const near = proj.to2D({ x: 0.2, y: 0, z: 0.25 });
    const offFar = far.x - cam.cx;
    const offNear = near.x - cam.cx;
    // the nearer one must project further out, by the ratio of the depths
    expect(offNear).toBeGreaterThan(offFar);
    expect(offNear / offFar).toBeCloseTo((2.0 + 0.25) / (2.0 - 0.25), 5);
  });

  it('reports a point behind the lens as not drawable', () => {
    const proj = cameraProjector(makeCamera(1.0, 0, 0));
    expect(proj.to2D({ x: 0, y: 0, z: 1.5 }).visible).toBe(false);
  });

  it('follows the preview onto a screen of a different size', () => {
    const cam = makeCamera(3.0, 0, 0);
    const a = cameraProjector(cam);
    const b = cameraProjector(cam, coverViewport(FRAME, { width: 360, height: 640 }));
    const p = { x: 0.2, y: 0.3, z: 0.05 };
    expect(b.to2D(p).x).toBeCloseTo(a.to2D(p).x / 2, 6);
    expect(b.to2D(p).y).toBeCloseTo(a.to2D(p).y / 2, 6);
  });

  it('crops the same way a full-bleed preview does', () => {
    const cam = makeCamera(3.0, 0, 0);
    // a 4:3 sensor shown on a tall phone: the sides are cropped, so the
    // overlay has to be cropped by exactly the same amount
    const sensor: FrameSize = { width: 960, height: 720 };
    const screen: FrameSize = { width: 411, height: 914 };
    const vp = coverViewport(sensor, screen);
    expect(vp.scale).toBeCloseTo(914 / 720, 6);
    // the centre of the frame stays the centre of the screen
    const c = vp.toScreen(480, 360);
    expect(c.x).toBeCloseTo(205.5, 6);
    expect(c.y).toBeCloseTo(457, 6);
    // and the frame is wider than the screen can show
    expect(vp.toScreen(0, 0).x).toBeLessThan(0);
  });

  it('mirrors the figure when the preview is mirrored', () => {
    const cam = makeCamera(3.0, 0.3, 0);
    const vp = coverViewport(FRAME, FRAME, true);
    const plain = cameraProjector(cam).to2D({ x: 0, y: 0, z: 0 });
    const flipped = cameraProjector(cam, vp).to2D({ x: 0, y: 0, z: 0 });
    expect(flipped.x).toBeCloseTo(FRAME.width - plain.x, 6);
    expect(flipped.y).toBeCloseTo(plain.y, 6);
  });

  it('round-trips screen coordinates back to the frame', () => {
    const vp = containViewport({ width: 1920, height: 1080 }, { width: 411, height: 914 }, true);
    const s = vp.toScreen(1234, 567);
    const f = vp.toFrame(s.x, s.y);
    expect(f.x).toBeCloseTo(1234, 6);
    expect(f.y).toBeCloseTo(567, 6);
  });

  it('points the eye direction back toward the lens', () => {
    const cam = makeCamera(3.0, 0, 0);
    const proj = cameraProjector(cam);
    const e = proj.eyeDir({ x: 0, y: 0, z: 0 });
    expect(e.z).toBeCloseTo(1, 6);
    // a point off to the right sees the lens off to its left
    expect(proj.eyeDir({ x: 0.5, y: 0, z: 0 }).x).toBeLessThan(0);
  });
});
