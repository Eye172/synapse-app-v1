/**
 * Quaternion math for the Rig (§2.9 v2). Every IMU node reports an absolute
 * orientation quaternion; body geometry is derived from those, so this module
 * is load-bearing for grading — it is pure, allocation-light and unit-tested.
 *
 * Component order is (r, i, j, k) = (w, x, y, z) throughout, matching the
 * firmware's own field names. Wire-format ordering is handled once, in the
 * protocol parser — never here.
 */

/** (r, i, j, k) — scalar first. */
export type Quat = readonly [number, number, number, number];

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const IDENTITY_QUAT: Quat = [1, 0, 0, 0];

export const DEG = 180 / Math.PI;

export function quatNorm(q: Quat): number {
  return Math.hypot(q[0], q[1], q[2], q[3]);
}

/** Unit-normalize; returns identity for a degenerate (zero/NaN) quaternion. */
export function quatNormalize(q: Quat): Quat {
  const n = quatNorm(q);
  if (!Number.isFinite(n) || n < 1e-9) return IDENTITY_QUAT;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export function quatConjugate(q: Quat): Quat {
  return [q[0], -q[1], -q[2], -q[3]];
}

/** Hamilton product a ⊗ b (apply b first, then a). */
export function quatMultiply(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

/**
 * Rotation that takes `from` to `to`: to ⊗ from⁻¹ expressed in the local
 * frame as from⁻¹ ⊗ to. This is the calibration primitive — "how far has this
 * segment moved since the neutral capture".
 */
export function quatRelative(reference: Quat, current: Quat): Quat {
  return quatMultiply(quatConjugate(reference), current);
}

/** Rotate a vector by a quaternion (v' = q v q*). */
export function quatRotate(q: Quat, v: Vec3): Vec3 {
  const [w, x, y, z] = q;
  // t = 2 * (qvec × v)
  const tx = 2 * (y * v.z - z * v.y);
  const ty = 2 * (z * v.x - x * v.z);
  const tz = 2 * (x * v.y - y * v.x);
  return {
    x: v.x + w * tx + (y * tz - z * ty),
    y: v.y + w * ty + (z * tx - x * tz),
    z: v.z + w * tz + (x * ty - y * tx),
  };
}

/** Smallest rotation angle represented by q, in degrees (0..180). */
export function quatAngleDeg(q: Quat): number {
  const w = Math.min(1, Math.abs(quatNormalize(q)[0]));
  return 2 * Math.acos(w) * DEG;
}

/**
 * Spherical linear interpolation — used to smooth jittery IMU streams without
 * the gimbal artifacts a per-component lerp would introduce.
 */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  const qa = quatNormalize(a);
  let qb = quatNormalize(b);
  let dot = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];
  // take the short way around
  if (dot < 0) {
    qb = [-qb[0], -qb[1], -qb[2], -qb[3]];
    dot = -dot;
  }
  if (dot > 0.9995) {
    // nearly parallel — normalized lerp is stable and cheaper
    return quatNormalize([
      qa[0] + (qb[0] - qa[0]) * t,
      qa[1] + (qb[1] - qa[1]) * t,
      qa[2] + (qb[2] - qa[2]) * t,
      qa[3] + (qb[3] - qa[3]) * t,
    ]);
  }
  const theta0 = Math.acos(Math.min(1, dot));
  const theta = theta0 * t;
  const sin0 = Math.sin(theta0);
  const s0 = Math.sin(theta0 - theta) / sin0;
  const s1 = Math.sin(theta) / sin0;
  return quatNormalize([
    qa[0] * s0 + qb[0] * s1,
    qa[1] * s0 + qb[1] * s1,
    qa[2] * s0 + qb[2] * s1,
    qa[3] * s0 + qb[3] * s1,
  ]);
}

// ---------- vectors ----------

export function vAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
export function vScale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
export function vDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
export function vCross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
export function vLen(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}
export function vNormalize(a: Vec3): Vec3 {
  const n = vLen(a);
  if (!Number.isFinite(n) || n < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: a.x / n, y: a.y / n, z: a.z / n };
}
/** Angle between two vectors, degrees (0..180). */
export function vAngleDeg(a: Vec3, b: Vec3): number {
  const la = vLen(a);
  const lb = vLen(b);
  if (la < 1e-9 || lb < 1e-9) return 0;
  return Math.acos(Math.max(-1, Math.min(1, vDot(a, b) / (la * lb)))) * DEG;
}

/**
 * An orthonormal body basis: where "right", "up" and "forward" point inside
 * the sensors' shared world frame. Built once at calibration from the back
 * node's neutral orientation, then used to express every segment direction in
 * anatomical terms regardless of how the hardware happens to be mounted.
 */
export interface BodyBasis {
  right: Vec3;
  up: Vec3;
  forward: Vec3;
}

export const DEFAULT_BASIS: BodyBasis = {
  right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  forward: { x: 0, y: 0, z: 1 },
};

/**
 * Gram-Schmidt an (up, forward) pair into a right-handed orthonormal basis.
 * Falls back to the default basis if the inputs are degenerate or parallel.
 */
export function makeBasis(up: Vec3, forwardHint: Vec3): BodyBasis {
  const u = vNormalize(up);
  if (vLen(u) < 0.5) return DEFAULT_BASIS;
  const f0 = vNormalize(forwardHint);
  // remove the vertical component from the forward hint
  const f = vNormalize({
    x: f0.x - u.x * vDot(f0, u),
    y: f0.y - u.y * vDot(f0, u),
    z: f0.z - u.z * vDot(f0, u),
  });
  if (vLen(f) < 0.5) return DEFAULT_BASIS;
  return { right: vNormalize(vCross(f, u)), up: u, forward: f };
}

/** Express a world-frame vector in body coordinates (right, up, forward). */
export function toBody(basis: BodyBasis, v: Vec3): Vec3 {
  return {
    x: vDot(v, basis.right),
    y: vDot(v, basis.up),
    z: vDot(v, basis.forward),
  };
}
