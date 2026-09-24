import { angleAt, isotropicLandmarks, tiltFromVertical, v3 } from './geometry';
import type { Landmark } from './types';

/** A point given in frame pixels, normalized the way a detector reports it. */
function px(x: number, y: number, frame: { width: number; height: number }): Landmark {
  return { x: x / frame.width, y: y / frame.height, v: 1 };
}

const PHONE = { width: 720, height: 1280 };

describe('isotropicLandmarks — one unit along every axis', () => {
  /**
   * The case that made this necessary. A torso leaning 30° from vertical,
   * measured straight off a 720×1280 frame's normalized points, reads as
   * about 46° — a lean fault on a lift done well.
   */
  it('recovers a 30° lean that per-axis normalization reads as ~46°', () => {
    const len = 400;
    const hip = px(360, 900, PHONE);
    const shoulder = px(360 + len * Math.sin(Math.PI / 6), 900 - len * Math.cos(Math.PI / 6), PHONE);

    const naive = tiltFromVertical(v3(hip), v3(shoulder));
    expect(naive).toBeGreaterThan(44);
    expect(naive).toBeLessThan(48);

    const [h, s] = isotropicLandmarks([hip, shoulder], PHONE);
    expect(tiltFromVertical(v3(h!), v3(s!))).toBeCloseTo(30, 5);
  });

  /**
   * A squat seen from the side: thigh rising up and forward from the knee,
   * shin running down and forward from it, 120° between them. Normalized per
   * axis on a phone frame this reads about 31° off — the difference between a
   * rep at depth and one flagged as shallow.
   */
  it('measures a joint angle as it is in the picture, not as normalization bends it', () => {
    const knee = { x: 360, y: 800 };
    const r = 300;
    const at = (deg: number) => ({
      x: knee.x + r * Math.cos((deg * Math.PI) / 180),
      y: knee.y + r * Math.sin((deg * Math.PI) / 180),
    });
    const hip = at(300);
    const ankle = at(60);
    const pts = [px(hip.x, hip.y, PHONE), px(knee.x, knee.y, PHONE), px(ankle.x, ankle.y, PHONE)];

    // the uncorrected reading is badly off, or this test would prove nothing
    const naive = angleAt(v3(pts[0]!), v3(pts[1]!), v3(pts[2]!));
    expect(Math.abs(naive - 120)).toBeGreaterThan(25);

    const [a, b, c] = isotropicLandmarks(pts, PHONE);
    expect(angleAt(v3(a!), v3(b!), v3(c!))).toBeCloseTo(120, 5);
  });

  it('keeps y — and so every threshold written against it — exactly as it was', () => {
    const [p] = isotropicLandmarks([{ x: 0.5, y: 0.75, z: 0.1, v: 0.9 }], PHONE);
    expect(p!.y).toBe(0.75);
    expect(p!.v).toBe(0.9);
    expect(p!.x).toBeCloseTo(0.5 * (720 / 1280));
    // z shares x's scale in a detector's output, so it moves with it
    expect(p!.z).toBeCloseTo(0.1 * (720 / 1280));
  });

  it('leaves the rig and the simulator alone: no frame, no change', () => {
    const pts: Landmark[] = [{ x: 0.3, y: 0.4, v: 1 }];
    expect(isotropicLandmarks(pts)).toBe(pts);
    expect(isotropicLandmarks(pts, { width: 500, height: 500 })).toBe(pts);
    expect(isotropicLandmarks(pts, { width: 0, height: 100 })).toBe(pts);
  });

  it('does not invent a depth that was not measured', () => {
    const [p] = isotropicLandmarks([{ x: 0.5, y: 0.5, v: 1 }], PHONE);
    expect(p!.z).toBeUndefined();
  });

  it('preserves the inferred-point flag the grader refuses to measure from', () => {
    const [p] = isotropicLandmarks([{ x: 0.5, y: 0.5, v: 1, est: true }], PHONE);
    expect(p!.est).toBe(true);
  });
});
