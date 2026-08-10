/**
 * The Rig as a body (§2.6, protocol v2). Five IMUs — back, both upper arms,
 * both thighs — are enough to place a whole skeleton and to measure the joint
 * angles that matter, without any camera at all.
 *
 * What the hardware can and cannot see is enforced here, once:
 *
 *   measured   spine/trunk orientation, hip angle (trunk↔thigh),
 *              shoulder elevation (trunk↔upper arm), left/right symmetry,
 *              thigh frontal-plane deviation (the valgus driver)
 *   estimated  forearm and shin direction — no IMU below the elbow or knee,
 *              so those points are drawn dimmed and withheld from the grader
 *
 * Mounting: the only assumptions are in RIG_MOUNT below. Everything derived
 * from *angles between two segments* — hip, shoulder, symmetry, lean — stays
 * correct even if those axes are guessed wrong, as long as all five sensors
 * are mounted alike. Verify on first hardware contact from the diagnostics
 * screen, which prints each segment's live direction.
 */
import {
  DEFAULT_BASIS,
  IDENTITY_QUAT,
  makeBasis,
  quatMultiply,
  quatConjugate,
  quatNormalize,
  quatRotate,
  quatSlerp,
  toBody,
  vAngleDeg,
  vNormalize,
  type BodyBasis,
  type Quat,
  type Vec3,
} from './quaternion';
import {
  LANDMARK_COUNT,
  LM,
  RIG_NODE_IDS,
  type Landmark,
  type RigNodeId,
  type SensorFrame,
} from './types';

/** The one place hardware mounting is assumed. */
export type MountAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

const AXIS_VECTORS: Record<MountAxis, Vec3> = {
  '+x': { x: 1, y: 0, z: 0 },
  '-x': { x: -1, y: 0, z: 0 },
  '+y': { x: 0, y: 1, z: 0 },
  '-y': { x: 0, y: -1, z: 0 },
  '+z': { x: 0, y: 0, z: 1 },
  '-z': { x: 0, y: 0, z: -1 },
};

/**
 * Which sensor-local axis runs along the body segment, and which points out
 * of the front of the body.
 *
 * This is the one thing about the hardware that cannot be derived — it
 * depends on how the boards sit in their straps. It is therefore settable at
 * runtime (Diagnostics → mount axis) so it can be fixed on the phone instead
 * of in a rebuild. Anything derived from the *angle between two segments* —
 * hip, shoulder, symmetry, lean — is unaffected by getting it wrong, as long
 * as all five sensors are mounted alike.
 */
export const RIG_MOUNT = {
  segmentAxis: AXIS_VECTORS['+z'] as Vec3,
  anteriorAxis: AXIS_VECTORS['+x'] as Vec3,
};

/** Point the model at a different mounting without rebuilding. */
export function setRigSegmentAxis(axis: MountAxis): void {
  RIG_MOUNT.segmentAxis = AXIS_VECTORS[axis];
  // keep the anterior axis perpendicular to whatever runs along the segment
  RIG_MOUNT.anteriorAxis =
    axis === '+x' || axis === '-x' ? AXIS_VECTORS['+z'] : AXIS_VECTORS['+x'];
}

export const MOUNT_AXES: MountAxis[] = ['+x', '-x', '+y', '-y', '+z', '-z'];

/** Body proportions in normalized screen units, shared with the simulator. */
const P = {
  hipY: 0.63,
  torso: 0.235,
  neck: 0.075,
  thigh: 0.185,
  shin: 0.185,
  upperArm: 0.14,
  forearm: 0.14,
  shoulderHalf: 0.083,
  hipHalf: 0.05,
} as const;

/** Neutral (calibration-pose) direction of each segment, in body coordinates. */
const NEUTRAL_DIR: Record<RigNodeId, Vec3> = {
  back: { x: 0, y: 1, z: 0 }, // trunk points up
  leftArm: { x: 0, y: -1, z: 0 }, // arms hang
  rightArm: { x: 0, y: -1, z: 0 },
  leftLeg: { x: 0, y: -1, z: 0 }, // thighs point down
  rightLeg: { x: 0, y: -1, z: 0 },
};

export interface RigSegmentState {
  id: RigNodeId;
  /** unit direction of the segment in body coords (x right, y up, z forward) */
  dir: Vec3;
  /** how far this segment has rotated from its calibrated neutral, degrees */
  deltaDeg: number;
  alert: boolean;
  /** true when this node reported in the current frame */
  present: boolean;
}

export interface RigBodyState {
  t: number;
  segments: Partial<Record<RigNodeId, RigSegmentState>>;
  calibrated: boolean;
}

// ---------- calibration ----------

/**
 * Holds the neutral-stance reference for every node and the body basis derived
 * from it. Zeroing against a real captured pose is what makes the whole thing
 * mounting-agnostic (§2.9 calibration).
 */
export class RigCalibration {
  private refs = new Map<RigNodeId, Quat>();
  private basis: BodyBasis = DEFAULT_BASIS;
  private complete = false;

  get isCalibrated(): boolean {
    return this.complete;
  }

  get bodyBasis(): BodyBasis {
    return this.basis;
  }

  /** Serializable form for persistence between sessions. */
  toJSON(): Record<string, [number, number, number, number]> {
    const out: Record<string, [number, number, number, number]> = {};
    for (const [id, q] of this.refs) out[id] = [q[0], q[1], q[2], q[3]];
    return out;
  }

  static fromJSON(raw: unknown): RigCalibration {
    const cal = new RigCalibration();
    if (typeof raw !== 'object' || raw === null) return cal;
    const entries: Array<[RigNodeId, Quat]> = [];
    for (const id of RIG_NODE_IDS) {
      const q = (raw as Record<string, unknown>)[id];
      if (Array.isArray(q) && q.length === 4 && q.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        entries.push([id, quatNormalize(q as unknown as Quat)]);
      }
    }
    if (entries.length > 0) cal.applyReferences(entries);
    return cal;
  }

  /** Adopt a set of neutral-pose quaternions and rebuild the body basis. */
  applyReferences(entries: Array<[RigNodeId, Quat]>): void {
    this.refs.clear();
    for (const [id, q] of entries) this.refs.set(id, quatNormalize(q));
    const back = this.refs.get('back');
    if (back) {
      // At the neutral pose the trunk is upright, so the back segment's world
      // direction *is* the body's up axis — no gravity assumption needed.
      const up = quatRotate(back, RIG_MOUNT.segmentAxis);
      const fwd = quatRotate(back, RIG_MOUNT.anteriorAxis);
      this.basis = makeBasis(up, fwd);
    } else {
      this.basis = DEFAULT_BASIS;
    }
    this.complete = this.refs.size > 0;
  }

  reference(id: RigNodeId): Quat {
    return this.refs.get(id) ?? IDENTITY_QUAT;
  }

  clear(): void {
    this.refs.clear();
    this.basis = DEFAULT_BASIS;
    this.complete = false;
  }
}

/**
 * Averages neutral-stance samples per node. IMU noise is small but the user's
 * sway is not, so a short hold is averaged rather than snapshotted.
 */
export class CalibrationCollector {
  private acc = new Map<RigNodeId, Quat>();
  private counts = new Map<RigNodeId, number>();

  add(frame: SensorFrame): void {
    for (const node of frame.nodes) {
      if (!node.quat) continue;
      const q = quatNormalize(node.quat);
      const prev = this.acc.get(node.id);
      const n = (this.counts.get(node.id) ?? 0) + 1;
      // running slerp average — cheap and stays on the unit sphere
      this.acc.set(node.id, prev ? quatSlerp(prev, q, 1 / n) : q);
      this.counts.set(node.id, n);
    }
  }

  get nodeCount(): number {
    return this.acc.size;
  }

  sampleCount(id: RigNodeId): number {
    return this.counts.get(id) ?? 0;
  }

  /** null until at least the back node has enough samples to be meaningful. */
  build(minSamples = 5): RigCalibration | null {
    const entries: Array<[RigNodeId, Quat]> = [];
    for (const [id, q] of this.acc) {
      if ((this.counts.get(id) ?? 0) >= minSamples) entries.push([id, q]);
    }
    if (!entries.some(([id]) => id === 'back')) return null;
    const cal = new RigCalibration();
    cal.applyReferences(entries);
    return cal;
  }

  reset(): void {
    this.acc.clear();
    this.counts.clear();
  }
}

// ---------- frame → body ----------

/**
 * Turn one sensor frame into segment directions. The rotation each sensor has
 * undergone since calibration is applied to that segment's known neutral
 * direction, so the result is anatomical regardless of sensor mounting.
 */
export function rigBodyState(frame: SensorFrame, cal: RigCalibration): RigBodyState {
  const segments: Partial<Record<RigNodeId, RigSegmentState>> = {};
  const basis = cal.bodyBasis;

  for (const node of frame.nodes) {
    if (!node.quat) continue;
    const q = quatNormalize(node.quat);
    const ref = cal.reference(node.id);
    // world-frame delta: how the sensor moved since neutral
    const delta = quatMultiply(q, quatConjugate(ref));
    const axisWorld: Vec3 = { x: delta[1], y: delta[2], z: delta[3] };
    const axisLen = Math.hypot(axisWorld.x, axisWorld.y, axisWorld.z);
    const angleRad = 2 * Math.atan2(axisLen, Math.abs(delta[0]));

    let dir = NEUTRAL_DIR[node.id];
    if (axisLen > 1e-6 && angleRad > 1e-6) {
      // express the rotation axis anatomically, then rotate the neutral direction
      const axisBody = vNormalize(toBody(basis, axisWorld));
      const signedAngle = delta[0] < 0 ? -angleRad : angleRad;
      dir = rotateAboutAxis(NEUTRAL_DIR[node.id], axisBody, signedAngle);
    }

    segments[node.id] = {
      id: node.id,
      dir: vNormalize(dir),
      deltaDeg: (angleRad * 180) / Math.PI,
      alert: node.alert === true,
      present: true,
    };
  }

  return { t: frame.t, segments, calibrated: cal.isCalibrated };
}

/** Rodrigues rotation of v about a unit axis. */
function rotateAboutAxis(v: Vec3, axis: Vec3, angleRad: number): Vec3 {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const dot = axis.x * v.x + axis.y * v.y + axis.z * v.z;
  return {
    x: v.x * c + (axis.y * v.z - axis.z * v.y) * s + axis.x * dot * (1 - c),
    y: v.y * c + (axis.z * v.x - axis.x * v.z) * s + axis.y * dot * (1 - c),
    z: v.z * c + (axis.x * v.y - axis.y * v.x) * s + axis.z * dot * (1 - c),
  };
}

// ---------- body → drawable skeleton ----------

function put(out: Landmark[], idx: number, p: Vec3, v: number, est = false): void {
  // body coords (x right, y up, z forward) → screen (x right, y down)
  out[idx] = { x: 0.5 + p.x, y: P.hipY - p.y, z: p.z, v, ...(est ? { est: true } : {}) };
}

function step(from: Vec3, dir: Vec3, len: number): Vec3 {
  return { x: from.x + dir.x * len, y: from.y + dir.y * len, z: from.z + dir.z * len };
}

const DOWN: Vec3 = { x: 0, y: -1, z: 0 };

/**
 * Forward-kinematics a 33-landmark pose from the segment directions, so the
 * Rig drives the exact same Mesh renderer and metric pipeline the camera does.
 */
export function rigLandmarks(state: RigBodyState): Landmark[] {
  const out: Landmark[] = new Array(LANDMARK_COUNT);
  for (let i = 0; i < LANDMARK_COUNT; i++) out[i] = { x: 0.5, y: 0.5, z: 0, v: 0 };

  const trunk = state.segments.back?.dir ?? { x: 0, y: 1, z: 0 };
  const trunkMeasured = state.segments.back !== undefined;

  const hipC: Vec3 = { x: 0, y: 0, z: 0 };
  const shoulderC = step(hipC, trunk, P.torso);
  // lateral axis of the trunk: perpendicular to the trunk, in the frontal plane
  const lateral = vNormalize({ x: trunk.y, y: -trunk.x, z: 0 });
  const lat = lateral.x === 0 && lateral.y === 0 ? { x: 1, y: 0, z: 0 } : lateral;

  const hipL: Vec3 = { x: hipC.x + lat.x * P.hipHalf, y: hipC.y + lat.y * P.hipHalf, z: hipC.z };
  const hipR: Vec3 = { x: hipC.x - lat.x * P.hipHalf, y: hipC.y - lat.y * P.hipHalf, z: hipC.z };
  const shL: Vec3 = { x: shoulderC.x + lat.x * P.shoulderHalf, y: shoulderC.y + lat.y * P.shoulderHalf, z: shoulderC.z };
  const shR: Vec3 = { x: shoulderC.x - lat.x * P.shoulderHalf, y: shoulderC.y - lat.y * P.shoulderHalf, z: shoulderC.z };

  const trunkV = trunkMeasured ? 1 : 0.25;
  put(out, LM.leftHip, hipL, trunkV);
  put(out, LM.rightHip, hipR, trunkV);
  put(out, LM.leftShoulder, shL, trunkV);
  put(out, LM.rightShoulder, shR, trunkV);

  const head = step(shoulderC, trunk, P.neck);
  put(out, LM.nose, head, trunkV, !trunkMeasured);
  const faceOffsets: Array<[number, number, number]> = [
    [LM.leftEyeInner, 0.008, 0.012], [LM.leftEye, 0.013, 0.013], [LM.leftEyeOuter, 0.018, 0.012],
    [LM.rightEyeInner, -0.008, 0.012], [LM.rightEye, -0.013, 0.013], [LM.rightEyeOuter, -0.018, 0.012],
    [LM.leftEar, 0.026, 0.006], [LM.rightEar, -0.026, 0.006],
    [LM.mouthLeft, 0.008, -0.01], [LM.mouthRight, -0.008, -0.01],
  ];
  for (const [idx, dx, dy] of faceOffsets) {
    put(out, idx, { x: head.x + dx, y: head.y + dy, z: head.z }, trunkV * 0.9, true);
  }

  // arms: upper arm measured, forearm continues (no forearm IMU)
  const arm = (
    nodeId: 'leftArm' | 'rightArm',
    shoulder: Vec3,
    elbowIdx: number,
    wristIdx: number,
    handIdx: [number, number, number],
    side: 1 | -1,
  ) => {
    const seg = state.segments[nodeId];
    const dir = seg?.dir ?? DOWN;
    const measured = seg !== undefined;
    const elbow = step(shoulder, dir, P.upperArm);
    put(out, elbowIdx, elbow, measured ? 1 : 0.25, !measured);
    const wrist = step(elbow, dir, P.forearm);
    put(out, wristIdx, wrist, measured ? 0.9 : 0.25, true);
    const beyond = step(wrist, dir, 0.03);
    for (const idx of handIdx) {
      put(out, idx, { x: beyond.x + side * 0.006, y: beyond.y, z: beyond.z }, 0.8, true);
    }
  };
  arm('leftArm', shL, LM.leftElbow, LM.leftWrist, [LM.leftIndex, LM.leftPinky, LM.leftThumb], 1);
  arm('rightArm', shR, LM.rightElbow, LM.rightWrist, [LM.rightIndex, LM.rightPinky, LM.rightThumb], -1);

  // legs: thigh measured, shin continues (no shin IMU)
  const leg = (
    nodeId: 'leftLeg' | 'rightLeg',
    hip: Vec3,
    kneeIdx: number,
    ankleIdx: number,
    heelIdx: number,
    toeIdx: number,
  ) => {
    const seg = state.segments[nodeId];
    const dir = seg?.dir ?? DOWN;
    const measured = seg !== undefined;
    const knee = step(hip, dir, P.thigh);
    put(out, kneeIdx, knee, measured ? 1 : 0.25, !measured);
    const ankle = step(knee, DOWN, P.shin);
    put(out, ankleIdx, ankle, measured ? 0.9 : 0.25, true);
    put(out, heelIdx, { x: ankle.x - 0.028, y: ankle.y - 0.012, z: ankle.z }, 0.8, true);
    put(out, toeIdx, { x: ankle.x + 0.05, y: ankle.y - 0.014, z: ankle.z }, 0.8, true);
  };
  leg('leftLeg', hipL, LM.leftKnee, LM.leftAnkle, LM.leftHeel, LM.leftFootIndex);
  leg('rightLeg', hipR, LM.rightKnee, LM.rightAnkle, LM.rightHeel, LM.rightFootIndex);

  return out;
}

// ---------- honest metrics straight from the Rig ----------

export interface RigMetrics {
  /** trunk tilt from the calibrated upright, degrees */
  torsoLean: number | null;
  /** trunk↔thigh interior angle, degrees; 180 = standing open */
  hipAngle: number | null;
  /** trunk↔upper-arm angle, degrees; 180 = overhead */
  shoulderElev: number | null;
  /** left/right agreement 0..100 */
  symmetry: number | null;
  /** thigh deviation out of the sagittal plane, degrees — the valgus driver */
  kneeValgus: number | null;
}

const EMPTY_RIG_METRICS: RigMetrics = {
  torsoLean: null,
  hipAngle: null,
  shoulderElev: null,
  symmetry: null,
  kneeValgus: null,
};

/**
 * Derive only what five IMUs can actually measure. Angles between two
 * segments are exact and mounting-independent; anything needing a joint we
 * have no sensor across (elbow, knee) is deliberately absent.
 */
export function rigMetrics(state: RigBodyState): RigMetrics {
  const m: RigMetrics = { ...EMPTY_RIG_METRICS };
  const back = state.segments.back;
  const lArm = state.segments.leftArm;
  const rArm = state.segments.rightArm;
  const lLeg = state.segments.leftLeg;
  const rLeg = state.segments.rightLeg;

  if (back) {
    const upright: Vec3 = { x: 0, y: 1, z: 0 };
    m.torsoLean = vAngleDeg(back.dir, upright);

    const thighs = [lLeg, rLeg].filter((s): s is RigSegmentState => s !== undefined);
    if (thighs.length > 0) {
      // Interior hip angle: trunk points hip→shoulder, thigh points hip→knee,
      // so the angle between them is the joint itself — 180 standing open,
      // closing as the hinge deepens. Take the deeper side.
      m.hipAngle = Math.min(...thighs.map((t) => vAngleDeg(back.dir, t.dir)));
    }

    const arms = [lArm, rArm].filter((s): s is RigSegmentState => s !== undefined);
    if (arms.length > 0) {
      // 180 = arm aligned with the trunk overhead, 0 = hanging at the side
      m.shoulderElev = Math.min(...arms.map((a) => 180 - vAngleDeg(back.dir, a.dir)));
    }
  }

  // Symmetry compares how far each limb has travelled from neutral, not the
  // angle between the limbs — a wide stance splays the thighs apart while
  // staying perfectly symmetric, and that must not read as a fault.
  const pairDiffs: number[] = [];
  if (lLeg && rLeg) pairDiffs.push(Math.abs(lLeg.deltaDeg - rLeg.deltaDeg));
  if (lArm && rArm) pairDiffs.push(Math.abs(lArm.deltaDeg - rArm.deltaDeg));
  if (pairDiffs.length > 0) {
    const worst = Math.max(...pairDiffs);
    m.symmetry = Math.max(0, Math.min(100, 100 - worst * 2.5));
  }

  // valgus proxy: thigh swinging out of the sagittal plane. The sign of the
  // lateral component tells medial (collapsing in) from lateral (tracking out);
  // only inward deviation is a fault.
  const medialDeg = (leg: RigSegmentState | undefined, inwardSign: 1 | -1): number | null => {
    if (!leg) return null;
    const inward = leg.dir.x * inwardSign;
    const vertical = Math.abs(leg.dir.y);
    if (vertical < 1e-6) return null;
    return Math.max(0, Math.atan2(inward, vertical) * (180 / Math.PI));
  };
  const vl = medialDeg(lLeg, -1); // left thigh drifts toward −x when caving in
  const vr = medialDeg(rLeg, 1);
  const valgus = [vl, vr].filter((x): x is number => x !== null);
  if (valgus.length > 0) m.kneeValgus = Math.max(...valgus);

  return m;
}
