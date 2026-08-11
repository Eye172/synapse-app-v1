import { quatNormalize, vNormalize, type Quat, type Vec3 } from '@/src/engine/quaternion';
import { LM, type Landmark, type RigNodeId, type SensorFrame, type SensorNode } from '@/src/engine/types';
import { Emitter, type SensorSource, type SourceStatus, type Unsubscribe } from '@/src/sources/types';

import { generatePose } from './kinematics';
import type { SimTimeline } from './simTimeline';

/**
 * The simulated Rig. It emits the *same* five-node quaternion frames the real
 * exoskeleton does, derived from the simulator's own body, so tests exercise
 * the production protocol, calibration and body model rather than a parallel
 * shortcut. It is a development instrument and is absent from release builds.
 */

/** Neutral direction of each segment in body coords, matching rigBody. */
const NEUTRAL: Record<RigNodeId, Vec3> = {
  back: { x: 0, y: 1, z: 0 },
  leftArm: { x: 0, y: -1, z: 0 },
  rightArm: { x: 0, y: -1, z: 0 },
  leftLeg: { x: 0, y: -1, z: 0 },
  rightLeg: { x: 0, y: -1, z: 0 },
};

/** Shortest-arc quaternion rotating `from` onto `to` (both unit). */
function quatFromTo(from: Vec3, to: Vec3): Quat {
  const dot = from.x * to.x + from.y * to.y + from.z * to.z;
  if (dot > 0.999999) return [1, 0, 0, 0];
  if (dot < -0.999999) {
    // 180°: pick any perpendicular axis
    const axis = Math.abs(from.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const perp = vNormalize({
      x: from.y * axis.z - from.z * axis.y,
      y: from.z * axis.x - from.x * axis.z,
      z: from.x * axis.y - from.y * axis.x,
    });
    return [0, perp.x, perp.y, perp.z];
  }
  const cross = {
    x: from.y * to.z - from.z * to.y,
    y: from.z * to.x - from.x * to.z,
    z: from.x * to.y - from.y * to.x,
  };
  return quatNormalize([1 + dot, cross.x, cross.y, cross.z]);
}

/** Body-coords direction between two landmarks (screen y is down). */
function segDir(lms: Landmark[], fromIdx: number, toIdx: number): Vec3 | null {
  const a = lms[fromIdx];
  const b = lms[toIdx];
  if (!a || !b || a.v < 0.3 || b.v < 0.3) return null;
  return vNormalize({ x: b.x - a.x, y: -(b.y - a.y), z: (b.z ?? 0) - (a.z ?? 0) });
}

function mid(a: Landmark, b: Landmark): Landmark {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2, v: Math.min(a.v, b.v) };
}

/** Read the five rig segment directions out of a simulated pose. */
function segmentDirections(lms: Landmark[]): Partial<Record<RigNodeId, Vec3>> {
  const out: Partial<Record<RigNodeId, Vec3>> = {};
  const ls = lms[LM.leftShoulder];
  const rs = lms[LM.rightShoulder];
  const lh = lms[LM.leftHip];
  const rh = lms[LM.rightHip];
  if (ls && rs && lh && rh) {
    const shoulder = mid(ls, rs);
    const hip = mid(lh, rh);
    out.back = vNormalize({ x: shoulder.x - hip.x, y: -(shoulder.y - hip.y), z: (shoulder.z ?? 0) - (hip.z ?? 0) });
  }
  const la = segDir(lms, LM.leftShoulder, LM.leftElbow);
  if (la) out.leftArm = la;
  const ra = segDir(lms, LM.rightShoulder, LM.rightElbow);
  if (ra) out.rightArm = ra;
  const ll = segDir(lms, LM.leftHip, LM.leftKnee);
  if (ll) out.leftLeg = ll;
  const rl = segDir(lms, LM.rightHip, LM.rightKnee);
  if (rl) out.rightLeg = rl;
  return out;
}

export class SimSensorSource implements SensorSource {
  readonly kind = 'sim' as const;
  status: SourceStatus = 'idle';

  private timer: ReturnType<typeof setInterval> | null = null;
  private frames = new Emitter<SensorFrame>();
  private statuses = new Emitter<SourceStatus>();

  constructor(
    private timeline: SimTimeline,
    private opts: { hz?: number; now?: () => number } = {},
  ) {}

  start(): void {
    if (this.timer) return;
    const hz = this.opts.hz ?? 30;
    this.setStatus('active');
    this.timer = setInterval(() => this.tickOnce(), Math.round(1000 / hz));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.setStatus('idle');
  }

  /** advance one frame — exposed for deterministic tests */
  tickOnce(nowMs?: number): SensorFrame {
    const now = nowMs ?? (this.opts.now ? this.opts.now() : Date.now());
    const p = this.timeline.at(now);
    const landmarks = generatePose(this.timeline.ex, {
      cyclePos: p.cyclePos,
      faults: p.faults,
      wobble: 0,
      noiseT: 0,
    });

    const dirs = segmentDirections(landmarks);
    const nodes: SensorNode[] = [];
    let anyAlert = false;
    for (const id of Object.keys(NEUTRAL) as RigNodeId[]) {
      const dir = dirs[id];
      if (!dir) continue;
      // an IMU reports absolute orientation; with an identity neutral the
      // shortest-arc rotation from the rest direction reproduces it exactly
      const quat = quatFromTo(NEUTRAL[id], dir);
      // the firmware flags a node when its own segment is out of tolerance;
      // the trunk folding past ~45° is the prototype's rule
      const alert = id === 'back' && dir.y < Math.cos((45 * Math.PI) / 180);
      anyAlert = anyAlert || alert;
      nodes.push({ id, quat: [quat[0], quat[1], quat[2], quat[3]], alert });
    }

    const frame: SensorFrame = {
      t: now,
      nodes,
      flags: { alert: anyAlert },
      battery: 83,
      protocol: 'v2-named',
    };
    this.frames.emit(frame);
    return frame;
  }

  onFrame(cb: (f: SensorFrame) => void): Unsubscribe {
    return this.frames.on(cb);
  }
  onStatus(cb: (s: SourceStatus) => void): Unsubscribe {
    return this.statuses.on(cb);
  }
  private setStatus(s: SourceStatus): void {
    this.status = s;
    this.statuses.emit(s);
  }
}
