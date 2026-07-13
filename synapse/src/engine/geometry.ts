import type { Landmark } from './types';

export const DEG = 180 / Math.PI;
export const RAD = Math.PI / 180;

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export function v3(l: Landmark): V3 {
  return { x: l.x, y: l.y, z: l.z ?? 0 };
}

export function sub(a: V3, b: V3): V3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function len(a: V3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function dot(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function mid(a: Landmark, b: Landmark): V3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 };
}

/** Interior angle at vertex b of the chain a-b-c, in degrees (0..180). */
export function angleAt(a: V3, b: V3, c: V3): number {
  const u = sub(a, b);
  const w = sub(c, b);
  const lu = len(u);
  const lw = len(w);
  if (lu < 1e-6 || lw < 1e-6) return 180;
  const cos = Math.max(-1, Math.min(1, dot(u, w) / (lu * lw)));
  return Math.acos(cos) * DEG;
}

/** Angle between vectors, degrees. */
export function angleBetween(u: V3, w: V3): number {
  const lu = len(u);
  const lw = len(w);
  if (lu < 1e-6 || lw < 1e-6) return 0;
  const cos = Math.max(-1, Math.min(1, dot(u, w) / (lu * lw)));
  return Math.acos(cos) * DEG;
}

/** Tilt of the vector a→b from screen-vertical (up), degrees. 0 = perfectly vertical. */
export function tiltFromVertical(a: V3, b: V3): number {
  const d = sub(b, a);
  const horiz = Math.sqrt(d.x * d.x + d.z * d.z);
  const vert = Math.abs(d.y);
  return Math.atan2(horiz, vert) * DEG;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
