import { vAdd, vCross, vDot, vNormalize, vScale, type Vec3 } from '@/src/engine/quaternion';

/**
 * Turning the body model into solid shapes on a flat canvas.
 *
 * The forward kinematics has always produced three dimensions — every
 * landmark carries a z — and the skeleton renderer threw it away in the line
 * that placed a point. This is the arithmetic that keeps it: a perspective
 * camera, a box per body segment, and the painter's ordering that makes near
 * limbs cover far ones.
 *
 * None of it touches Skia, so all of it can be checked without a device.
 */

/** A body-space point: x right, y up, z toward the viewer. */
export type P3 = Vec3;

export interface Camera {
  /** rotation about the vertical axis, radians — the turntable */
  yaw: number;
  /** rotation about the horizontal axis, radians — looking down on the lifter */
  pitch: number;
  /** how far the eye sits from the body centre, in body units */
  distance: number;
  /** focal length; larger = flatter, smaller = more dramatic convergence */
  focal: number;
}

/**
 * Tuned against a measured body rather than by eye. A rig frame mid-squat
 * spans 1.29 units tall and 0.6 deep, so at this distance the nearest limb
 * draws about a quarter larger than the furthest — enough for depth to read,
 * short of the caricature a close camera gives — and the focal length is
 * whatever makes that body fill roughly three fifths of the screen.
 */
export const DEFAULT_CAMERA: Camera = {
  // a slight three-quarter turn: straight on hides exactly the depth this
  // view exists to show, and a hard profile hides left/right asymmetry
  yaw: -0.42,
  pitch: 0.12,
  distance: 2.6,
  focal: 5.0,
};

export interface Projected {
  x: number;
  y: number;
  /** distance from the eye — the sort key, and what near/far shading uses */
  depth: number;
  /** false when the point sits behind the eye and must not be drawn */
  visible: boolean;
}

/** Rotate a body-space point into eye space. */
export function toEye(p: P3, cam: Camera): P3 {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const x1 = p.x * cy + p.z * sy;
  const z1 = -p.x * sy + p.z * cy;
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const y2 = p.y * cp - z1 * sp;
  const z2 = p.y * sp + z1 * cp;
  return { x: x1, y: y2, z: z2 };
}

/**
 * Body space → canvas pixels, with a real perspective divide.
 *
 * A single scale is used for both axes. Stretching x by the canvas width and
 * y by its height is fine for a flat skeleton but shears a solid: a box would
 * lean differently depending on the phone's aspect ratio.
 */
export function project(p: P3, cam: Camera, width: number, height: number): Projected {
  const e = toEye(p, cam);
  const depth = cam.distance - e.z;
  // anything at or behind the eye has no meaningful projection
  if (depth <= 0.05) return { x: 0, y: 0, depth, visible: false };
  const scale = (cam.focal / depth) * Math.min(width, height) * 0.5;
  return {
    x: width / 2 + e.x * scale,
    y: height / 2 - e.y * scale,
    depth,
    visible: true,
  };
}

export interface Quad {
  /** corners in body space, wound counter-clockwise when facing out */
  corners: P3[];
  /** outward normal, for shading */
  normal: P3;
}

/**
 * A reference axis guaranteed not to be parallel to the limb.
 *
 * The caller's hint has to be normalized before it can be compared: the
 * natural thing to pass is a difference between two landmarks, whose length
 * is the width of a body rather than one, and an un-normalized dot product
 * never trips the parallel test. The cross product then collapses toward
 * zero, normalizing it amplifies rounding error into a random direction, and
 * every face of the solid ends up pointing the wrong way — the part simply
 * vanishes, with nothing thrown and nothing logged.
 */
function crossSectionRef(axis: P3, hint: P3): P3 {
  const h = vNormalize(hint);
  if (Math.abs(vDot(axis, h)) <= 0.95) return h;
  // fall back to whichever world axis the limb leans on least
  const ax = Math.abs(axis.x);
  const ay = Math.abs(axis.y);
  const az = Math.abs(axis.z);
  if (ax <= ay && ax <= az) return { x: 1, y: 0, z: 0 };
  return ay <= az ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
}

/**
 * A rectangular prism running from `from` to `to`.
 *
 * The cross-section needs an orientation, and a segment direction alone does
 * not give one — so a reference axis is projected onto the plane across the
 * limb. Where the rig measures roll this could carry it; until the body model
 * keeps roll, a stable reference at least stops the box spinning on its own.
 */
export function limbBox(from: P3, to: P3, halfWidth: number, halfDepth: number, ref: P3 = { x: 0, y: 0, z: 1 }): Quad[] {
  const axis = vNormalize({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z });
  const r = crossSectionRef(axis, ref);
  const side = vNormalize(vCross(axis, r));
  const up = vNormalize(vCross(side, axis));

  const corner = (base: P3, s: number, u: number): P3 =>
    vAdd(vAdd(base, vScale(side, s * halfWidth)), vScale(up, u * halfDepth));

  // a: near end, b: far end; 0..3 walk the cross-section the same way at both
  const a = [corner(from, -1, -1), corner(from, 1, -1), corner(from, 1, 1), corner(from, -1, 1)] as const;
  const b = [corner(to, -1, -1), corner(to, 1, -1), corner(to, 1, 1), corner(to, -1, 1)] as const;

  const quad = (c: P3[]): Quad => ({ corners: c, normal: quadNormal(c) });

  return [
    quad([a[0], a[1], a[2], a[3]]), // cap at `from`
    quad([b[3], b[2], b[1], b[0]]), // cap at `to`
    quad([a[0], a[3], b[3], b[0]]),
    quad([a[1], a[0], b[0], b[1]]),
    quad([a[2], a[1], b[1], b[2]]),
    quad([a[3], a[2], b[2], b[3]]),
  ];
}

/** Outward normal of a planar face from its first three corners. */
export function quadNormal(c: readonly P3[]): P3 {
  const u = { x: c[1].x - c[0].x, y: c[1].y - c[0].y, z: c[1].z - c[0].z };
  const v = { x: c[2].x - c[0].x, y: c[2].y - c[0].y, z: c[2].z - c[0].z };
  return vNormalize(vCross(u, v));
}

/** Light from over the viewer's left shoulder, so faces read as volume. */
const LIGHT: P3 = vNormalize({ x: -0.45, y: 0.72, z: 0.55 });

/**
 * How lit a face is, 0..1. Never reaches zero: an unlit face on a dark ground
 * is a hole in the body, and the shape has to stay readable from any angle.
 */
export function shade(normal: P3, cam: Camera): number {
  const n = toEye(normal, cam);
  const lambert = Math.max(0, vDot(vNormalize(n), LIGHT));
  return 0.42 + 0.58 * lambert;
}

/**
 * How a solid gets onto a canvas.
 *
 * Two of these exist and they are not interchangeable. The live view invents
 * a camera and turns the body in front of it. An overlay has no camera to
 * invent: the photograph's lens already projected the scene, the landmarks
 * carry the result, and a second projection on top would slide the figure off
 * the person. Sharing this interface is what lets both use the same outline
 * code instead of one growing a copy of it.
 */
export interface Projector {
  to2D(p: P3): Projected;
  /** unit vector from a point toward the eye, for back-face culling */
  eyeDir(p: P3): P3;
  /** distance from the eye, for painter ordering */
  depthOf(p: P3): number;
}

export function perspectiveProjector(cam: Camera, width: number, height: number): Projector {
  return {
    to2D: (p) => project(p, cam, width, height),
    eyeDir: (p) => {
      const e = toEye(p, cam);
      return vNormalize({ x: -e.x, y: -e.y, z: cam.distance - e.z });
    },
    depthOf: (p) => cam.distance - toEye(p, cam).z,
  };
}

/**
 * True when a face turns away from the eye.
 *
 * Back faces are skipped rather than drawn and overpainted — with the tinted
 * translucency this view uses, drawing them would double the colour on every
 * limb and make a healthy segment read as a faulted one.
 */
export function facesAway(q: Quad, proj: Projector): boolean {
  const c = centroid(q.corners);
  return vDot(q.normal, proj.eyeDir(c)) <= 0;
}

export function centroid(c: readonly P3[]): P3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of c) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const n = c.length || 1;
  return { x: x / n, y: y / n, z: z / n };
}

/** Mean distance from the eye — the painter's sort key. */
export function faceDepth(q: Quad, proj: Projector): number {
  return proj.depthOf(centroid(q.corners));
}

/**
 * Farthest first, so nearer shapes paint over them.
 *
 * Sorting whole faces rather than whole limbs is what lets an arm pass in
 * front of the chest correctly; sorting by limb would make it pop through.
 */
export function painterSort<T extends { depth: number }>(faces: T[]): T[] {
  return [...faces].sort((a, b) => b.depth - a.depth);
}

// ---------------------------------------------------------------------------
// Cylinders, and drawing solids as outlines
// ---------------------------------------------------------------------------

/**
 * A tube from `from` to `to`, as a ring of flat side faces plus two caps.
 *
 * The topology is kept — sides in ring order, caps separate — because the
 * silhouette of a cylinder cannot be recovered from a loose bag of faces, and
 * the silhouette is the only part of it worth drawing in outline.
 */
export interface Cylinder {
  sides: Quad[];
  capFrom: Quad;
  capTo: Quad;
}

/**
 * A tube that is allowed to be shaped like the thing it stands for.
 *
 * A body has no uniform round parts. A thigh is half again as thick at the
 * hip as at the knee; a waist is much wider than it is deep. Forced to draw
 * both as even pipes, the figure has to be either too thin where the body
 * is broad or too fat where it is narrow, and measured against a real
 * person's outline it loses either way.
 */
export interface TubeShape {
  /** radius at `from` */
  rFrom: number;
  /** radius at `to` */
  rTo: number;
  /**
   * Depth as a fraction of width, 1 being round. The narrow axis is the
   * reference direction — front to back on a torso.
   */
  flatten?: number;
}

export function cylinder(
  from: P3,
  to: P3,
  shape: number | TubeShape,
  sides = 14,
  ref: P3 = { x: 0, y: 0, z: 1 },
): Cylinder {
  const s: TubeShape =
    typeof shape === 'number' ? { rFrom: shape, rTo: shape, flatten: 1 } : shape;
  const flat = s.flatten ?? 1;
  const axis = vNormalize({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z });
  const r = crossSectionRef(axis, ref);
  const u = vNormalize(vCross(axis, r));
  const v = vNormalize(vCross(axis, u));

  const ring = (base: P3, radius: number): P3[] => {
    const pts: P3[] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      pts.push(
        vAdd(
          vAdd(base, vScale(u, Math.cos(a) * radius)),
          vScale(v, Math.sin(a) * radius * flat),
        ),
      );
    }
    return pts;
  };

  const a = ring(from, s.rFrom);
  const b = ring(to, s.rTo);
  const face = (c: P3[]): Quad => ({ corners: c, normal: quadNormal(c) });

  const sideFaces: Quad[] = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    sideFaces.push(face([a[i]!, a[j]!, b[j]!, b[i]!]));
  }
  return { sides: sideFaces, capFrom: face([...a].reverse()), capTo: face(b) };
}

/** A polyline ready to stroke, in canvas pixels. */
export interface Outline {
  pts: { x: number; y: number }[];
  closed: boolean;
  /** distance from the eye, for painter ordering */
  depth: number;
}

function projectFace(c: readonly P3[], proj: Projector): { x: number; y: number }[] | null {
  const out: { x: number; y: number }[] = [];
  for (const p of c) {
    const q = proj.to2D(p);
    if (!q.visible) return null;
    out.push({ x: q.x, y: q.y });
  }
  return out;
}

/**
 * A box in outline: every face turned toward the eye, drawn as a closed loop.
 *
 * Three of the six survive from any angle, and their shared edges are what
 * make a cube read as a cube rather than as a square.
 */
export function boxOutline(faces: Quad[], proj: Projector): Outline[] {
  const out: Outline[] = [];
  for (const f of faces) {
    if (facesAway(f, proj)) continue;
    const pts = projectFace(f.corners, proj);
    if (!pts) continue;
    out.push({ pts, closed: true, depth: faceDepth(f, proj) });
  }
  return out;
}

/**
 * A cylinder in outline: the cap facing the eye, and the two lines where the
 * surface turns away.
 *
 * Outlining every side face instead would draw the facets of the
 * approximation — a barrel of stripes rather than a limb.
 */
export function cylinderOutline(cyl: Cylinder, proj: Projector): Outline[] {
  const out: Outline[] = [];
  const front = cyl.sides.map((f) => !facesAway(f, proj));

  for (let i = 0; i < cyl.sides.length; i++) {
    const j = (i + 1) % cyl.sides.length;
    // the seam between a face we can see and one we cannot is the outline
    if (front[i] === front[j]) continue;
    const side = cyl.sides[i]!;
    // corners are [a_i, a_j, b_j, b_i]; the shared edge is a_j → b_j
    const edge = projectFace([side.corners[1]!, side.corners[2]!], proj);
    if (!edge) continue;
    out.push({ pts: edge, closed: false, depth: faceDepth(side, proj) });
  }

  for (const cap of [cyl.capFrom, cyl.capTo]) {
    if (facesAway(cap, proj)) continue;
    const pts = projectFace(cap.corners, proj);
    if (!pts) continue;
    out.push({ pts, closed: true, depth: faceDepth(cap, proj) });
  }
  return out;
}

/** Every face of a cylinder, for depth ordering against other solids. */
export function cylinderFaces(cyl: Cylinder): Quad[] {
  return [...cyl.sides, cyl.capFrom, cyl.capTo];
}

/**
 * Every face turned toward the eye, projected — the area a solid covers.
 *
 * Outlines alone cannot hide anything: with nothing filled, a far limb's
 * edges show straight through a near one and the figure reads as a tangle of
 * flat lines rather than a body. Painting these in the page's own colour
 * before stroking, far parts first, is hidden-line removal — the drawing
 * stays pure outline while near parts cover what is behind them.
 */
export function coveredArea(faces: Quad[], proj: Projector): Outline[] {
  const out: Outline[] = [];
  for (const f of faces) {
    if (facesAway(f, proj)) continue;
    const pts = projectFace(f.corners, proj);
    if (!pts) continue;
    out.push({ pts, closed: true, depth: faceDepth(f, proj) });
  }
  return out;
}
