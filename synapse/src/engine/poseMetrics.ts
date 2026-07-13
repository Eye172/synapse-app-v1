/**
 * Derives the honest metric set from a pose frame. Used identically by the
 * simulator and the camera path, so grading never depends on where the
 * skeleton came from. Metrics that cannot be measured from the available
 * data come back `null` — the engine reports NO DATA instead of guessing.
 */
import { angleAt, angleBetween, clamp, mid, sub, tiltFromVertical, v3, type V3 } from './geometry';
import { EMPTY_METRICS, LM, type JointMetrics, type Landmark } from './types';

const VIS_MIN = 0.35;

function lm(landmarks: Landmark[], i: number): Landmark | null {
  const l = landmarks[i];
  if (!l || l.v < VIS_MIN) return null;
  return l;
}

function hasDepth(landmarks: Landmark[]): boolean {
  return landmarks.some((l) => l.z !== undefined && Math.abs(l.z) > 1e-6);
}

/** Rolling temporal state for velocity/consistency metrics. Create one per set. */
export class MetricTracker {
  private torsoLeanSamples: { t: number; v: number }[] = [];
  private hipY: { t: number; v: number }[] = [];
  private shoulderY: { t: number; v: number }[] = [];
  private lastJerk = 0;

  reset(): void {
    this.torsoLeanSamples = [];
    this.hipY = [];
    this.shoulderY = [];
    this.lastJerk = 0;
  }

  private push(arr: { t: number; v: number }[], t: number, v: number, windowMs: number): void {
    arr.push({ t, v });
    while (arr.length > 0 && t - arr[0]!.t > windowMs) arr.shift();
  }

  /** deg of torso wobble (rolling std over ~2.5s) */
  torsoAngleVar(t: number, torsoLean: number): number {
    this.push(this.torsoLeanSamples, t, torsoLean, 2500);
    const s = this.torsoLeanSamples;
    if (s.length < 6) return 0;
    const mean = s.reduce((a, b) => a + b.v, 0) / s.length;
    const varr = s.reduce((a, b) => a + (b.v - mean) ** 2, 0) / s.length;
    return Math.sqrt(varr) * 2; // spread ≈ 2σ
  }

  /** peak torso angular velocity deg/s with decay (row heave) */
  jerk(t: number, torsoLean: number): number {
    const s = this.torsoLeanSamples;
    const prev = s.length >= 2 ? s[s.length - 2] : undefined;
    let vel = 0;
    if (prev && t > prev.t) vel = Math.abs((torsoLean - prev.v) / ((t - prev.t) / 1000));
    this.lastJerk = Math.max(vel, this.lastJerk * 0.92);
    return this.lastJerk;
  }

  /** 0..100 — are hips and shoulders rising together? (deadlift) */
  hipRiseSync(t: number, hipY: number, shoulderY: number): number {
    this.push(this.hipY, t, hipY, 450);
    this.push(this.shoulderY, t, shoulderY, 450);
    if (this.hipY.length < 4) return 100;
    const dHip = this.hipY[0]!.v - hipY; // positive = hips rising (y is down)
    const dSh = this.shoulderY[0]!.v - shoulderY;
    if (dHip < 0.004) return 100; // hips not rising — nothing to judge
    const ratio = dSh / dHip; // 1 = perfect sync, 0 = hips only
    return clamp(100 - Math.max(0, 1 - ratio) * 140, 0, 100);
  }
}

/**
 * Compute every metric derivable from this pose; leave the rest null.
 * `tracker` carries the temporal state (one per set).
 */
export function deriveMetrics(
  landmarks: Landmark[],
  t: number,
  tracker: MetricTracker,
): Omit<JointMetrics, 't'> {
  const m: Omit<JointMetrics, 't'> = { ...EMPTY_METRICS };
  const depth = hasDepth(landmarks);

  const ls = lm(landmarks, LM.leftShoulder);
  const rs = lm(landmarks, LM.rightShoulder);
  const lh = lm(landmarks, LM.leftHip);
  const rh = lm(landmarks, LM.rightHip);
  const lk = lm(landmarks, LM.leftKnee);
  const rk = lm(landmarks, LM.rightKnee);
  const la = lm(landmarks, LM.leftAnkle);
  const ra = lm(landmarks, LM.rightAnkle);
  const le = lm(landmarks, LM.leftElbow);
  const re = lm(landmarks, LM.rightElbow);
  const lw = lm(landmarks, LM.leftWrist);
  const rw = lm(landmarks, LM.rightWrist);
  const nose = lm(landmarks, LM.nose);

  const shoulderMid = ls && rs ? mid(ls, rs) : null;
  const hipMid = lh && rh ? mid(lh, rh) : null;

  // ---- trunk ----
  if (shoulderMid && hipMid) {
    m.torsoLean = tiltFromVertical(hipMid, shoulderMid);
    m.torsoAngleVar = tracker.torsoAngleVar(t, m.torsoLean);
    m.jerk = tracker.jerk(t, m.torsoLean);
    m.hipRiseSync = tracker.hipRiseSync(t, hipMid.y, shoulderMid.y);

    // spineFlex: 90 = straight back (regardless of hinge), drops as the upper
    // back rounds relative to the lower torso. Proxy: kink between the
    // hip→shoulder line and the shoulder→head line.
    if (nose) {
      const lower = sub(shoulderMid, hipMid);
      const upper = sub(v3(nose), shoulderMid);
      const kink = angleBetween(lower, upper); // 0 = collinear = straight
      m.spineFlex = clamp(90 - (kink - 18) * 1.6, 0, 95); // ~18° natural head offset
    }
  }

  // ---- legs ----
  const kneeAngles: number[] = [];
  if (lh && lk && la && (depth || sideish(lh, lk, la))) kneeAngles.push(angleAt(v3(lh), v3(lk), v3(la)));
  if (rh && rk && ra && (depth || sideish(rh, rk, ra))) kneeAngles.push(angleAt(v3(rh), v3(rk), v3(ra)));
  if (kneeAngles.length) m.kneeAngle = Math.min(...kneeAngles);

  const hipAngles: number[] = [];
  if (ls && lh && lk && (depth || sideish(lh, lk, la ?? lk))) hipAngles.push(angleAt(v3(ls), v3(lh), v3(lk)));
  if (rs && rh && rk && (depth || sideish(rh, rk, ra ?? rk))) hipAngles.push(angleAt(v3(rs), v3(rh), v3(rk)));
  if (hipAngles.length) m.hipAngle = Math.min(...hipAngles);

  if (lh && lk && rh && rk) {
    // hip crease at/below the knee (y grows downward); small tolerance = "at parallel"
    const hipY = Math.max(lh.y, rh.y);
    const kneeY = Math.min(lk.y, rk.y);
    m.hipBelowKnee = hipY > kneeY - 0.03;
  }

  // knee valgus needs a frontal view: knees pulling inside their ankle toward the midline
  if (lh && lk && la && rh && rk && ra) {
    const stance = Math.abs(la.x - ra.x);
    if (stance > 0.06) {
      const midX = (la.x + ra.x) / 2;
      // 3D thigh length — the y-span collapses at depth and would blow the angle up
      const thighL = Math.hypot(lh.x - lk.x, lh.y - lk.y, (lh.z ?? 0) - (lk.z ?? 0));
      const thighR = Math.hypot(rh.x - rk.x, rh.y - rk.y, (rh.z ?? 0) - (rk.z ?? 0));
      const dirL = Math.sign(midX - la.x);
      const dirR = Math.sign(midX - ra.x);
      const inL = Math.max(0, (lk.x - la.x) * dirL);
      const inR = Math.max(0, (rk.x - ra.x) * dirR);
      m.kneeValgus = Math.atan2(Math.max(inL / (thighL + 1e-6), inR / (thighR + 1e-6)), 1) * (180 / Math.PI);
    }
  }

  // ---- arms ----
  const elbowAngles: number[] = [];
  if (ls && le && lw) elbowAngles.push(angleAt(v3(ls), v3(le), v3(lw)));
  if (rs && re && rw) elbowAngles.push(angleAt(v3(rs), v3(re), v3(rw)));
  if (elbowAngles.length) m.elbowAngle = Math.min(...elbowAngles);

  if (shoulderMid && hipMid && (le || re)) {
    const torsoDown = sub(hipMid, shoulderMid);
    const elevs: number[] = [];
    if (ls && le) elevs.push(angleBetween(sub(v3(le), v3(ls)), torsoDown));
    if (rs && re) elevs.push(angleBetween(sub(v3(re), v3(rs)), torsoDown));
    if (elevs.length) m.shoulderElev = Math.min(...elevs);

    const flares: number[] = [];
    if (ls && le && lh) flares.push(angleAt(v3(le), v3(ls), v3(lh)));
    if (rs && re && rh) flares.push(angleAt(v3(re), v3(rs), v3(rh)));
    if (flares.length) m.elbowFlare = Math.max(...flares);
  }

  if (le && lw && re && rw) {
    const stackL = Math.atan2(Math.abs(lw.x - le.x), Math.abs(le.y - lw.y) + 1e-6) * (180 / Math.PI);
    const stackR = Math.atan2(Math.abs(rw.x - re.x), Math.abs(re.y - rw.y) + 1e-6) * (180 / Math.PI);
    m.wristStack = Math.max(stackL, stackR);
  }

  // ---- bar path: wrist drift from mid-foot, % of leg length ----
  if (lw && rw && la && ra && lh && rh) {
    const wristMid = mid(lw, rw);
    const ankleMid = mid(la, ra);
    const legLen = Math.abs(mid(lh, rh).y - ankleMid.y) + 1e-6;
    // in a side view drift is on x; in a frontal view it is on z (needs depth)
    const sideView = Math.abs(la.x - ra.x) < 0.06;
    const drift = sideView ? Math.abs(wristMid.x - ankleMid.x) : depth ? Math.abs(wristMid.z - ankleMid.z) : null;
    if (drift !== null) m.barPathDev = (drift / legLen) * 100;
  }

  // ---- lumbar extension (needs depth): hips pushed forward of the ankle–shoulder line ----
  if (depth && shoulderMid && hipMid && la && ra) {
    const ankleMid = mid(la, ra);
    const spanY = Math.abs(shoulderMid.y - ankleMid.y) + 1e-6;
    const lineZatHip =
      ankleMid.z + ((shoulderMid.z - ankleMid.z) * (hipMid.y - ankleMid.y)) / (shoulderMid.y - ankleMid.y || 1e-6);
    const fwd = Math.max(0, lineZatHip - hipMid.z); // hips toward camera vs the line
    m.lumbarExt = Math.atan2(fwd, spanY * 0.4) * (180 / Math.PI);
  }

  // ---- symmetry (frontal views only): L/R height balance ----
  if (ls && rs && lh && rh && lk && rk && Math.abs((la?.x ?? 0) - (ra?.x ?? 1)) > 0.06) {
    const scale = Math.abs(mid(lh, rh).y - mid(ls, rs).y) + 1e-6;
    const devs =
      Math.abs(ls.y - rs.y) / scale + Math.abs(lh.y - rh.y) / scale + Math.abs(lk.y - rk.y) / scale;
    m.symmetry = clamp(100 - devs * 160, 0, 100);
  }

  return m;
}

/** true when the three points are roughly coplanar with the screen (side view) — 2D angles are then honest */
function sideish(a: Landmark, b: Landmark, c: Landmark): boolean {
  // Heuristic: in a side view the x-spread of a leg chain is large vs its z availability.
  const xs = Math.max(a.x, b.x, c.x) - Math.min(a.x, b.x, c.x);
  const ys = Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y);
  return xs > 0.02 || ys > 0.2;
}
