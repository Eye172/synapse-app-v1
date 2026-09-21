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
  /** the four corners, in body space, wound counter-clockwise when facing out */
  corners: [P3, P3, P3, P3];
  /** outward normal, for shading */
  normal: P3;
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
  // a reference parallel to the limb gives a degenerate cross-section
  let r = ref;
  if (Math.abs(vDot(axis, r)) > 0.95) r = { x: 1, y: 0, z: 0 };
  const side = vNormalize(vCross(axis, r));
  const up = vNormalize(vCross(side, axis));

  const corner = (base: P3, s: number, u: number): P3 =>
    vAdd(vAdd(base, vScale(side, s * halfWidth)), vScale(up, u * halfDepth));

  // a: near end, b: far end; 0..3 walk the cross-section the same way at both
  const a = [corner(from, -1, -1), corner(from, 1, -1), corner(from, 1, 1), corner(from, -1, 1)] as const;
  const b = [corner(to, -1, -1), corner(to, 1, -1), corner(to, 1, 1), corner(to, -1, 1)] as const;

  const quad = (c: [P3, P3, P3, P3]): Quad => ({ corners: c, normal: quadNormal(c) });

  return [
    quad([a[0], a[1], a[2], a[3]]), // cap at `from`
    quad([b[3], b[2], b[1], b[0]]), // cap at `to`
    quad([a[0], a[3], b[3], b[0]]),
    quad([a[1], a[0], b[0], b[1]]),
    quad([a[2], a[1], b[1], b[2]]),
    quad([a[3], a[2], b[2], b[3]]),
  ];
}

/** Outward normal of a planar quad from its first three corners. */
export function quadNormal(c: [P3, P3, P3, P3]): P3 {
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
 * True when a face turns away from the eye.
 *
 * Back faces are skipped rather than drawn and overpainted — with the tinted
 * translucency this view uses, drawing them would double the colour on every
 * limb and make a healthy segment read as a faulted one.
 */
export function facesAway(q: Quad, cam: Camera): boolean {
  const c = centroid(q.corners);
  const eye = toEye(c, cam);
  const n = toEye(q.normal, cam);
  // vector from the face to the eye
  const toViewer = { x: -eye.x, y: -eye.y, z: cam.distance - eye.z };
  return vDot(n, vNormalize(toViewer)) <= 0;
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
export function faceDepth(q: Quad, cam: Camera): number {
  return cam.distance - toEye(centroid(q.corners), cam).z;
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
