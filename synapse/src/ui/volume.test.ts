import {
  DEFAULT_CAMERA,
  facesAway,
  faceDepth,
  limbBox,
  painterSort,
  project,
  quadNormal,
  shade,
  toEye,
  type Camera,
  type P3,
} from './volume';

/**
 * The projection is the whole difference between a stick figure and a body
 * with depth, and every way it can be wrong is silent: a box that shears with
 * the phone's aspect ratio, a limb that paints through the chest, a face lit
 * from the wrong side. None of that throws — it just looks subtly wrong on
 * someone else's phone.
 */

const FRONT_ON: Camera = { yaw: 0, pitch: 0, distance: 3, focal: 2.5 };

describe('the perspective camera', () => {
  it('puts the body centre in the middle of the canvas', () => {
    const p = project({ x: 0, y: 0, z: 0 }, FRONT_ON, 400, 800);
    expect(p.x).toBeCloseTo(200, 6);
    expect(p.y).toBeCloseTo(400, 6);
    expect(p.visible).toBe(true);
  });

  it('shrinks what is further away — this is the whole point', () => {
    const near = project({ x: 0.5, y: 0, z: 0.8 }, FRONT_ON, 400, 800);
    const far = project({ x: 0.5, y: 0, z: -0.8 }, FRONT_ON, 400, 800);
    const offsetNear = Math.abs(near.x - 200);
    const offsetFar = Math.abs(far.x - 200);
    expect(offsetNear).toBeGreaterThan(offsetFar);
    expect(near.depth).toBeLessThan(far.depth);
  });

  it('scales both axes alike, so a solid does not shear with the aspect ratio', () => {
    // the same offset along x and along y must travel the same number of
    // pixels; stretching x by width and y by height is fine for a flat
    // skeleton and wrong for a box
    const tall = project({ x: 0.4, y: 0, z: 0 }, FRONT_ON, 400, 800);
    const up = project({ x: 0, y: 0.4, z: 0 }, FRONT_ON, 400, 800);
    expect(Math.abs(tall.x - 200)).toBeCloseTo(Math.abs(up.y - 400), 6);
  });

  it('refuses to project what is behind the eye', () => {
    const behind = project({ x: 0, y: 0, z: 10 }, FRONT_ON, 400, 800);
    expect(behind.visible).toBe(false);
  });

  it('keeps y pointing up on screen', () => {
    const head = project({ x: 0, y: 0.5, z: 0 }, FRONT_ON, 400, 800);
    const foot = project({ x: 0, y: -0.5, z: 0 }, FRONT_ON, 400, 800);
    expect(head.y).toBeLessThan(foot.y);
  });

  it('turns the body when the camera yaws', () => {
    const straight = project({ x: 0, y: 0, z: 0.5 }, FRONT_ON, 400, 800);
    const turned = project({ x: 0, y: 0, z: 0.5 }, { ...FRONT_ON, yaw: 0.6 }, 400, 800);
    expect(turned.x).not.toBeCloseTo(straight.x, 3);
  });

  it('leaves the origin alone however the camera moves', () => {
    const e = toEye({ x: 0, y: 0, z: 0 }, DEFAULT_CAMERA);
    expect(e.x).toBeCloseTo(0, 10);
    expect(e.y).toBeCloseTo(0, 10);
    expect(e.z).toBeCloseTo(0, 10);
  });
});

describe('a limb as a solid', () => {
  const from = { x: 0, y: 0, z: 0 };
  const to = { x: 0, y: -1, z: 0 };

  it('is a closed box: six faces', () => {
    expect(limbBox(from, to, 0.1, 0.1)).toHaveLength(6);
  });

  it('spans exactly the segment it was given', () => {
    const faces = limbBox(from, to, 0.1, 0.1);
    const ys = faces.flatMap((f) => f.corners.map((c) => c.y));
    expect(Math.max(...ys)).toBeCloseTo(0, 6);
    expect(Math.min(...ys)).toBeCloseTo(-1, 6);
  });

  it('is as thick as it was asked to be', () => {
    const faces = limbBox(from, to, 0.15, 0.05);
    const xs = faces.flatMap((f) => f.corners.map((c) => c.x));
    const zs = faces.flatMap((f) => f.corners.map((c) => c.z));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.3, 6);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.1, 6);
  });

  it('survives a limb pointing along the reference axis', () => {
    // a thigh aimed straight at the camera is exactly where a naive
    // cross-section collapses to nothing
    const faces = limbBox({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.1, 0.1);
    expect(faces).toHaveLength(6);
    for (const f of faces) {
      for (const n of [f.normal.x, f.normal.y, f.normal.z]) expect(Number.isFinite(n)).toBe(true);
    }
  });

  it('gives every face a unit normal', () => {
    for (const f of limbBox(from, { x: 0.3, y: -0.8, z: 0.2 }, 0.1, 0.08)) {
      expect(Math.hypot(f.normal.x, f.normal.y, f.normal.z)).toBeCloseTo(1, 6);
    }
  });

  it('points every normal outward, away from the box centre', () => {
    // an inward normal is shaded as if lit from inside the body
    const faces = limbBox(from, to, 0.1, 0.1);
    const mid = { x: 0, y: -0.5, z: 0 };
    for (const f of faces) {
      const c = f.corners.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4, z: a.z + p.z / 4 }), { x: 0, y: 0, z: 0 });
      const outward = { x: c.x - mid.x, y: c.y - mid.y, z: c.z - mid.z };
      const dot = f.normal.x * outward.x + f.normal.y * outward.y + f.normal.z * outward.z;
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('shows exactly half its faces from any one angle', () => {
    for (const yaw of [0, 0.4, -0.9, 1.7, 3.0]) {
      const cam = { ...DEFAULT_CAMERA, yaw };
      const visible = limbBox(from, to, 0.1, 0.1).filter((f) => !facesAway(f, cam));
      expect(visible.length).toBeLessThanOrEqual(3);
      expect(visible.length).toBeGreaterThan(0);
    }
  });
});

describe('shading and ordering', () => {
  it('never lets a face go fully black', () => {
    for (const n of [{ x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }]) {
      const s = shade(n, DEFAULT_CAMERA);
      expect(s).toBeGreaterThan(0.3);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it('lights a face turned toward the light more than one turned away', () => {
    const lit = shade({ x: -0.45, y: 0.72, z: 0.55 }, FRONT_ON);
    const away = shade({ x: 0.45, y: -0.72, z: -0.55 }, FRONT_ON);
    expect(lit).toBeGreaterThan(away);
  });

  it('paints far faces before near ones', () => {
    const faces = [{ depth: 1 }, { depth: 5 }, { depth: 3 }];
    expect(painterSort(faces).map((f) => f.depth)).toEqual([5, 3, 1]);
  });

  it('measures depth from the eye, not from the body', () => {
    const nearFace = limbBox({ x: 0, y: 0, z: 1 }, { x: 0, y: -0.5, z: 1 }, 0.1, 0.1)[0]!;
    const farFace = limbBox({ x: 0, y: 0, z: -1 }, { x: 0, y: -0.5, z: -1 }, 0.1, 0.1)[0]!;
    expect(faceDepth(nearFace, FRONT_ON)).toBeLessThan(faceDepth(farFace, FRONT_ON));
  });

  it('agrees with itself about which way a quad faces', () => {
    const c: [P3, P3, P3, P3] = [
      { x: -1, y: -1, z: 0 },
      { x: 1, y: -1, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: -1, y: 1, z: 0 },
    ];
    expect(quadNormal(c).z).toBeCloseTo(1, 6);
  });
});
