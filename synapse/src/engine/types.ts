/**
 * Core engine contracts. The deterministic rule engine — never an LLM —
 * produces grades, colors, alerts, and rep counts from these types (§2.7).
 */

// ---------- pose ----------

/** BlazePose 33-landmark topology indices. */
export const LM = {
  nose: 0,
  leftEyeInner: 1, leftEye: 2, leftEyeOuter: 3,
  rightEyeInner: 4, rightEye: 5, rightEyeOuter: 6,
  leftEar: 7, rightEar: 8,
  mouthLeft: 9, mouthRight: 10,
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16,
  leftPinky: 17, rightPinky: 18,
  leftIndex: 19, rightIndex: 20,
  leftThumb: 21, rightThumb: 22,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
  leftHeel: 29, rightHeel: 30,
  leftFootIndex: 31, rightFootIndex: 32,
} as const;

export const LANDMARK_COUNT = 33;

/** One landmark in normalized screen space (x right, y down, [0..1]). */
export interface Landmark {
  x: number;
  y: number;
  /** depth, same scale as x/y, negative = toward camera; optional (detector-dependent) */
  z?: number;
  /** visibility/confidence 0..1 */
  v: number;
}

export interface PoseFrame {
  /** arrival time, ms */
  t: number;
  landmarks: Landmark[];
  source: 'sim' | 'camera';
}

// ---------- sensor (the Rig) ----------

/** Normalized internal frame every transport maps into (§2.9). */
export interface SensorFrame {
  /** arrival time, ms */
  t: number;
  nodes: SensorNode[];
  flags: { alert?: boolean };
  battery?: number;
}

export interface SensorNode {
  id: string; // body segment id, e.g. "spine"
  angleDeg?: number;
  quat?: [number, number, number, number];
}

// ---------- metrics ----------

/**
 * The fused, honest metric set the grader consumes.
 * `null` means "not measurable with the sources currently present" —
 * rules over a null metric report NO DATA instead of guessing (deal-breaker 2).
 */
export interface JointMetrics {
  t: number;
  /** deg of trunk from vertical; 0 = upright */
  torsoLean: number | null;
  /** Rig spine node pitch in deg (0 = horizontal fold, 90 = upright); authoritative when linked */
  spineFlex: number | null;
  /** interior knee angle deg, min(L,R); 180 = straight */
  kneeAngle: number | null;
  /** interior hip angle deg; 180 = open/standing */
  hipAngle: number | null;
  /** interior elbow angle deg; 180 = straight */
  elbowAngle: number | null;
  /** arm elevation deg; 180 = overhead lockout */
  shoulderElev: number | null;
  /** knee inward collapse deg, max(L,R); 0 = tracking over toes */
  kneeValgus: number | null;
  /** elbow flare from torso deg (bench) */
  elbowFlare: number | null;
  /** lumbar overextension proxy deg (press) */
  lumbarExt: number | null;
  /** bar/wrist drift from mid-foot, % of leg length */
  barPathDev: number | null;
  /** wrist-over-elbow stack deviation deg */
  wristStack: number | null;
  /** hips below knee crease (squat depth) */
  hipBelowKnee: boolean | null;
  /** L/R symmetry 0..100 */
  symmetry: number | null;
  /** hip-shoulder rise sync 0..100 (deadlift) */
  hipRiseSync: number | null;
  /** torso angle wobble within the set, deg (row) */
  torsoAngleVar: number | null;
  /** torso angular velocity spike deg/s (row heave) */
  jerk: number | null;
}

export type MetricId = keyof Omit<JointMetrics, 't'>;

export const EMPTY_METRICS: Omit<JointMetrics, 't'> = {
  torsoLean: null,
  spineFlex: null,
  kneeAngle: null,
  hipAngle: null,
  elbowAngle: null,
  shoulderElev: null,
  kneeValgus: null,
  elbowFlare: null,
  lumbarExt: null,
  barPathDev: null,
  wristStack: null,
  hipBelowKnee: null,
  symmetry: null,
  hipRiseSync: null,
  torsoAngleVar: null,
  jerk: null,
};

// ---------- segments (Mesh tint targets) ----------

export type SegmentId =
  | 'head'
  | 'neck'
  | 'torso'
  | 'hips'
  | 'leftArm'
  | 'rightArm'
  | 'leftForearm'
  | 'rightForearm'
  | 'leftThigh'
  | 'rightThigh'
  | 'leftShin'
  | 'rightShin';

export const ALL_SEGMENTS: SegmentId[] = [
  'head', 'neck', 'torso', 'hips',
  'leftArm', 'rightArm', 'leftForearm', 'rightForearm',
  'leftThigh', 'rightThigh', 'leftShin', 'rightShin',
];

// ---------- rules ----------

export type RiskJoint = 'spine' | 'knee' | 'shoulder';

export interface FormRule {
  id: string;
  /** human name for report rows */
  name: string;
  /** Mesh segments this rule tints */
  segments: SegmentId[];
  metric: MetricId;
  kind: 'range' | 'bool';
  /**
   * frame: graded continuously every frame (tint + live cues).
   * rep: judged once per completed rep from that rep's extremes (depth checks).
   */
  scope: 'frame' | 'rep';
  /** for rep-scope range rules: which extreme of the metric to judge */
  repJudge?: 'min' | 'max';
  /** range kind: value inside → severity 0 */
  ok?: [number, number];
  /** superset of ok: inside warn but outside ok → severity 0..1; outside warn → 1 */
  warn?: [number, number];
  /** bool kind: expected value */
  expected?: boolean;
  /** higher wins the single live cue slot */
  priority: number;
  /** RuleCoach cue, ≤8 words, spoken as-is */
  cue: string;
  /** plain-English "what we watch" for the detail screen */
  explain: string;
  /** non-null → error raises a safety alert (red is sacred) */
  risk: RiskJoint | null;
}

// ---------- exercise ----------

export interface RepSpec {
  metric: MetricId;
  /** metric value at the top of the movement (extended) */
  topAngle: number;
  /** metric value at the bottom (flexed) */
  bottomAngle: number;
  hysteresis: number;
  /** does the movement start extended (squat) or flexed (deadlift/press)? */
  startsAt: 'top' | 'bottom';
}

export interface TempoSpec {
  /** target seconds: eccentric, pause, concentric */
  ecc: number;
  pause: number;
  con: number;
}

export interface ExerciseSpec {
  id: string;
  name: string;
  category: 'compound' | 'accessory';
  riskLevel: 1 | 2 | 3;
  bodyRegion: 'legs' | 'posterior' | 'shoulders' | 'chest' | 'back';
  /** drives the rep phase machine label */
  primaryJoint: string;
  /** sim/ghost camera framing */
  view: 'front' | 'side';
  rep: RepSpec;
  tempo?: TempoSpec;
  rules: FormRule[];
  lesson: {
    summary: string;
    /** joints/muscles the Mesh watches, for the detail screen */
    watchList: string[];
    /** bundled tutorial clip key, or null → placeholder player */
    videoKey: 'clip1' | 'clip2' | 'clip3' | 'clip4' | null;
  };
  /** true when the v0 Rig (single spine node) already grades this lift */
  hasRigRules: boolean;
}
