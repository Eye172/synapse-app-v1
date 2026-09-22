import type { Landmark } from '@/src/engine/types';
import type { P3, Projected, Projector } from '@/src/ui/volume';

import type { FrameSize, WorldPoint } from './types';
import type { Viewport } from './viewport';

/**
 * Solving for the camera that took the picture.
 *
 * This is the piece that decides whether the overlay is really three
 * dimensional or just a drawing traced over a photograph. The previous
 * version mapped body x and y straight back to pixels and kept z only to
 * decide what covered what — which is tracing: nothing about the figure
 * changed when a limb came toward the lens, because no lens was involved.
 *
 * What happens instead: the detector gives a metric skeleton in
 * centimetres, and separately says where each of those joints landed in the
 * frame. Those two together are enough to recover where the camera must
 * have been — how far away, and how far off centre. Once that camera
 * exists, the mannequin is built in metres around the metric skeleton and
 * pushed through a real perspective divide. A forearm pointing at the phone
 * gets wider because it is nearer, and it lands on the arm in the picture
 * because the camera that projects it is the camera that saw it.
 *
 * Three unknowns are solved: how far the body is from the lens, and where
 * it sits across and up the frame. Focal length is not solved — a single
 * view cannot separate "small and close" from "large and far", so it is
 * fixed from the lens's field of view and the distance absorbs the rest.
 */

export interface FittedCamera {
  /** focal length in pixels, from the lens field of view */
  focal: number;
  /** principal point, pixels */
  cx: number;
  cy: number;
  /** metres from the lens to the body origin (the hips) */
  distance: number;
  /** where the hips sit relative to the optical axis, metres */
  tx: number;
  ty: number;
  /** RMS reprojection error in pixels — how well this camera explains the frame */
  residual: number;
  /** how many landmarks carried the fit */
  used: number;
  frame: FrameSize;
}

export interface FitOptions {
  /**
   * Horizontal field of view of the lens, degrees. Phone front cameras sit
   * around 60-70; the exact number mostly trades off against the solved
   * distance, so a wrong guess still lands the figure on the person — it
   * only changes how strong the perspective looks.
   */
  hfovDeg?: number;
  /** below this visibility a landmark is not evidence about the camera */
  minVisibility?: number;
  /** Gauss-Newton passes over the full perspective model */
  iterations?: number;
}

const DEFAULTS = { hfovDeg: 65, minVisibility: 0.5, iterations: 6 };

/**
 * Landmarks that hold still relative to the body and are detected well.
 *
 * Fitting against all 33 lets the noisiest ones — fingers, the fine points
 * around the face — pull the camera around. The trunk and the large joints
 * are both the best detected and the most rigid, which is what a camera
 * solve wants.
 */
const FIT_POINTS = [11, 12, 23, 24, 13, 14, 25, 26, 15, 16, 27, 28, 0];

/** Residual beyond this many pixels is treated as an outlier, not a signal. */
const HUBER = 24;

export function focalFromFov(width: number, hfovDeg: number): number {
  return width / 2 / Math.tan((hfovDeg * Math.PI) / 360);
}

/**
 * Recover the camera from a metric skeleton and where it landed in frame.
 *
 * Returns null when too little of the body was seen to say anything — a
 * camera guessed from three points is worse than no overlay, because a
 * wrong one puts a confident figure in the wrong place.
 */
export function fitCamera(
  world: WorldPoint[],
  image: Landmark[],
  frame: FrameSize,
  opts: FitOptions = {},
): FittedCamera | null {
  const { hfovDeg, minVisibility, iterations } = { ...DEFAULTS, ...opts };
  const focal = focalFromFov(frame.width, hfovDeg);
  const cx = frame.width / 2;
  const cy = frame.height / 2;

  // gather the correspondences: a metric point and the pixel it was seen at
  const X: number[] = [];
  const Y: number[] = [];
  const Z: number[] = [];
  const U: number[] = [];
  const V: number[] = [];
  const W: number[] = [];
  for (const i of FIT_POINTS) {
    const w = world[i];
    const p = image[i];
    if (!w || !p) continue;
    const conf = Math.min(w.v, p.v);
    if (conf < minVisibility) continue;
    X.push(w.x);
    Y.push(w.y);
    Z.push(w.z);
    U.push(p.x * frame.width);
    V.push(p.y * frame.height);
    W.push(conf);
  }
  const n = X.length;
  // three unknowns need more than three points to be worth solving
  if (n < 6) return null;

  // ---- step 1: weak perspective, which has a closed form ----------------
  // With the body far enough away that its own depth barely matters, the
  // projection is a scale and an offset, and scale is the one number that
  // says how far away the person is standing.
  let sw = 0;
  let mX = 0;
  let mY = 0;
  let mU = 0;
  let mV = 0;
  for (let i = 0; i < n; i++) {
    sw += W[i]!;
    mX += W[i]! * X[i]!;
    mY += W[i]! * -Y[i]!;
    mU += W[i]! * U[i]!;
    mV += W[i]! * V[i]!;
  }
  mX /= sw;
  mY /= sw;
  mU /= sw;
  mV /= sw;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const a = X[i]! - mX;
    const b = -Y[i]! - mY;
    num += W[i]! * (a * (U[i]! - mU) + b * (V[i]! - mV));
    den += W[i]! * (a * a + b * b);
  }
  // a degenerate spread means every point landed on top of every other one
  if (den < 1e-9) return null;
  const scale = num / den;
  // a body cannot project to zero or negative pixels per metre
  if (!(scale > 1e-6) || !Number.isFinite(scale)) return null;

  let distance = focal / scale;
  let tx = (mU - scale * mX - cx) / scale;
  let ty = (cy - (mV - scale * mY)) / scale;

  // ---- step 2: refine against the real perspective divide ---------------
  // Weak perspective systematically misplaces a body that is close to the
  // lens, which is exactly the case this app cares about. Each pass here
  // moves the camera to reduce the reprojection error under the true
  // model; a handful converge.
  let residual = Infinity;
  for (let iter = 0; iter < iterations; iter++) {
    // normal equations for the 3 unknowns (tx, ty, distance)
    const A = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const g = [0, 0, 0];
    let sse = 0;
    let swTotal = 0;

    for (let i = 0; i < n; i++) {
      const d = distance - Z[i]!;
      // a joint at or behind the lens has no projection to match
      if (d < 0.05) continue;
      const px = X[i]! + tx;
      const py = Y[i]! + ty;
      const u = cx + (focal * px) / d;
      const v = cy - (focal * py) / d;
      const ru = u - U[i]!;
      const rv = v - V[i]!;

      // one badly placed wrist should not drag the whole camera with it
      const mag = Math.hypot(ru, rv);
      const huber = mag > HUBER ? HUBER / mag : 1;
      const w = W[i]! * huber;

      const juTx = focal / d;
      const juD = (-focal * px) / (d * d);
      const jvTy = -focal / d;
      const jvD = (focal * py) / (d * d);

      // J^T W J, upper triangle mirrored
      A[0] += w * juTx * juTx;
      A[2] += w * juTx * juD;
      A[4] += w * jvTy * jvTy;
      A[5] += w * jvTy * jvD;
      A[8] += w * (juD * juD + jvD * jvD);
      g[0] += w * juTx * ru;
      g[1] += w * jvTy * rv;
      g[2] += w * (juD * ru + jvD * rv);

      sse += w * (ru * ru + rv * rv);
      swTotal += w;
    }
    if (swTotal <= 0) return null;
    A[1] = 0; // tx and ty are independent under this model
    A[3] = 0;
    A[6] = A[2];
    A[7] = A[5];

    residual = Math.sqrt(sse / swTotal / 2);

    // Levenberg damping keeps the step sane when the problem is flat
    const lm = 1e-6 * (A[0]! + A[4]! + A[8]!) + 1e-9;
    const step = solve3(
      [A[0]! + lm, A[1]!, A[2]!, A[3]!, A[4]! + lm, A[5]!, A[6]!, A[7]!, A[8]! + lm],
      g,
    );
    if (!step) break;

    tx -= step[0];
    ty -= step[1];
    const next = distance - step[2];
    // never let a step push the body through the lens
    distance = Math.max(0.25, next);

    if (Math.abs(step[0]) + Math.abs(step[1]) + Math.abs(step[2]) < 1e-5) break;
  }

  if (!Number.isFinite(distance) || !Number.isFinite(tx) || !Number.isFinite(ty)) return null;

  return { focal, cx, cy, distance, tx, ty, residual, used: n, frame };
}

/** Gaussian elimination on a 3x3, row-major. Null when singular. */
function solve3(m: number[], b: number[]): [number, number, number] | null {
  const a = [
    [m[0]!, m[1]!, m[2]!, b[0]!],
    [m[3]!, m[4]!, m[5]!, b[1]!],
    [m[6]!, m[7]!, m[8]!, b[2]!],
  ];
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[piv]![c]!)) piv = r;
    if (Math.abs(a[piv]![c]!) < 1e-12) return null;
    [a[c], a[piv]] = [a[piv]!, a[c]!];
    const d = a[c]![c]!;
    for (let k = c; k < 4; k++) a[c]![k]! /= d;
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = a[r]![c]!;
      if (f === 0) continue;
      for (let k = c; k < 4; k++) a[r]![k]! -= f * a[c]![k]!;
    }
  }
  return [a[0]![3]!, a[1]![3]!, a[2]![3]!];
}

/**
 * Project through the fitted camera, in the frame's own pixels.
 *
 * This is the same `Projector` the synthetic studio camera implements, so
 * every piece of solid-drawing code works against either without knowing
 * which it has — the difference between "show me the body from an angle"
 * and "put the body back where the lens saw it" is one object, not two
 * renderers.
 */
export function cameraProjector(cam: FittedCamera, viewport?: Viewport): Projector {
  // the fit was solved in the camera frame's pixels; the preview it has to
  // land on is a different size and shape, and the viewport is the only
  // thing that knows how the two line up
  const to2D = (p: P3): Projected => {
    const d = cam.distance - p.z;
    if (d <= 0.05) return { x: 0, y: 0, depth: d, visible: false };
    const fx = cam.cx + (cam.focal * (p.x + cam.tx)) / d;
    const fy = cam.cy - (cam.focal * (p.y + cam.ty)) / d;
    const s = viewport ? viewport.toScreen(fx, fy) : { x: fx, y: fy };
    return { x: s.x, y: s.y, depth: d, visible: true };
  };

  return {
    to2D,
    // the lens sits at the origin of camera space, which in body space is
    // back along +z and opposite the body's own offset
    eyeDir: (p: P3) => {
      const x = -cam.tx - p.x;
      const y = -cam.ty - p.y;
      const z = cam.distance - p.z;
      const l = Math.hypot(x, y, z) || 1;
      return { x: x / l, y: y / l, z: z / l };
    },
    depthOf: (p: P3) => cam.distance - p.z,
  };
}
