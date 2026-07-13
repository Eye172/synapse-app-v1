/**
 * Parametric 3D stick-body generator — the single source of truth for
 * simulated poses, get-into-position ghosts, and Library thumbnails.
 * Joint angles are set explicitly by forward kinematics, so metrics derived
 * from the landmarks (poseMetrics.deriveMetrics) match the intent exactly.
 */
import { RAD, lerp } from '@/src/engine/geometry';
import { LANDMARK_COUNT, LM, type ExerciseSpec, type Landmark } from '@/src/engine/types';

export interface FaultLevels {
  /** upper back rounds (squat/deadlift/rdl/row) */
  spineRound?: number;
  /** knees cave inward (squat) */
  kneeValgus?: number;
  /** bar drifts forward of mid-foot (deadlift/press/bench) */
  barDrift?: number;
  /** lumbar layback (press) */
  layback?: number;
  /** elbows flare toward the head (bench) */
  elbowFlare?: number;
  /** body-english heave (row) */
  heave?: number;
  /** hips shoot up first out of the hole (deadlift) */
  hipShoot?: number;
  /** uneven L/R drive */
  asymmetry?: number;
  /** cut the range of motion short */
  shallow?: number;
}

export interface PoseGenInput {
  /** 0..1 through one rep; 0 = start position */
  cyclePos: number;
  faults?: FaultLevels;
  /** 0..1 organic wobble */
  wobble?: number;
  /** noise clock, seconds */
  noiseT?: number;
}

// body proportions, fraction of screen height (portrait)
const P = {
  groundY: 0.865,
  shin: 0.185,
  thigh: 0.185,
  torso: 0.235,
  neck: 0.075,
  upperArm: 0.14,
  forearm: 0.14,
  stance: 0.095, // half stance width, frontal
  hipHalf: 0.05,
  shoulderHalf: 0.083,
  sideLat: 0.011, // near/far limb offset in side view
};

interface Pt {
  f: number; // forward (sagittal), + = the way the lifter faces
  y: number; // screen y, down
  lat: number; // lateral, + = lifter's left
}

const pt = (f: number, y: number, lat: number): Pt => ({ f, y, lat });

/** smooth 0→1→0 over the cycle */
function movement(cyclePos: number): number {
  return (1 - Math.cos(2 * Math.PI * cyclePos)) / 2;
}

/** smooth organic noise in [-1, 1] */
function noise(t: number, k: number): number {
  return (Math.sin(t * 1.7 + k * 12.9) * 0.6 + Math.sin(t * 3.1 + k * 4.7) * 0.4);
}

interface Body {
  ankleL: Pt; ankleR: Pt;
  kneeL: Pt; kneeR: Pt;
  hipL: Pt; hipR: Pt;
  shoulderL: Pt; shoulderR: Pt;
  elbowL: Pt; elbowR: Pt;
  wristL: Pt; wristR: Pt;
  nose: Pt;
}

interface ChainLat {
  ankle: number;
  hip: number;
  shoulder: number;
}
/** front view: real body widths; side view: thin depth offsets so 3D angles stay honest */
const FRONT_LAT: ChainLat = { ankle: P.stance, hip: P.hipHalf, shoulder: P.shoulderHalf };
const SIDE_LAT: ChainLat = { ankle: P.sideLat, hip: P.sideLat * 0.8, shoulder: P.sideLat };

/**
 * Build the lower body + trunk from explicit joint angles (degrees).
 * σ shin-forward tilt, k knee interior, h hip interior, all sagittal.
 */
function chain(
  σ: number,
  k: number,
  h: number,
  opts: {
    ankleF?: number;
    lat?: ChainLat;
    latScaleKnee?: [number, number];
    rounding?: number;
    sideDelta?: { kL: number; kR: number };
  },
): Omit<Body, 'elbowL' | 'elbowR' | 'wristL' | 'wristR' | 'nose'> & { shoulderMid: Pt; torsoTilt: number } {
  const ankleF = opts.ankleF ?? 0;
  const lat = opts.lat ?? FRONT_LAT;
  const τ = 180 - k - σ; // thigh tilt from vertical
  const θt = Math.max(-8, 180 - h - τ); // torso tilt from vertical

  const dKL = opts.sideDelta?.kL ?? 0;
  const dKR = opts.sideDelta?.kR ?? 0;

  const mkLeg = (latAnkle: number, latHip: number, dk: number, latKneeShift: number) => {
    const ankle = pt(ankleF, P.groundY, latAnkle);
    const σs = σ + dk * 0.3;
    const ks = k + dk;
    const τs = 180 - ks - σs;
    const knee = pt(
      ankle.f + P.shin * Math.sin(σs * RAD),
      ankle.y - P.shin * Math.cos(σs * RAD),
      (latAnkle + latHip) / 2 + latKneeShift,
    );
    const hip = pt(
      knee.f - P.thigh * Math.sin(τs * RAD),
      knee.y - P.thigh * Math.cos(τs * RAD),
      latHip,
    );
    return { ankle, knee, hip };
  };

  const L = mkLeg(lat.ankle, lat.hip, dKL, opts.latScaleKnee?.[0] ?? 0);
  const R = mkLeg(-lat.ankle, -lat.hip, dKR, opts.latScaleKnee?.[1] ?? 0);

  const hipMid = pt((L.hip.f + R.hip.f) / 2, (L.hip.y + R.hip.y) / 2, 0);
  const rounding = opts.rounding ?? 0;
  const θtEff = θt + rounding * 6;
  const shoulderMid = pt(
    hipMid.f + P.torso * Math.sin(θtEff * RAD) + rounding * 0.03,
    hipMid.y - P.torso * Math.cos(θtEff * RAD) + rounding * 0.012,
    0,
  );

  return {
    ankleL: L.ankle, ankleR: R.ankle,
    kneeL: L.knee, kneeR: R.knee,
    hipL: pt(L.hip.f, L.hip.y, lat.hip), hipR: pt(R.hip.f, R.hip.y, -lat.hip),
    shoulderL: pt(shoulderMid.f, shoulderMid.y, lat.shoulder),
    shoulderR: pt(shoulderMid.f, shoulderMid.y, -lat.shoulder),
    shoulderMid,
    torsoTilt: θtEff,
  };
}

function headFrom(shoulderMid: Pt, torsoTilt: number, rounding: number): Pt {
  const tilt = torsoTilt + rounding * 92; // rounding kinks the neck hard forward
  return pt(
    shoulderMid.f + P.neck * Math.sin(tilt * RAD),
    shoulderMid.y - P.neck * Math.cos(tilt * RAD) * (1 - rounding * 0.35),
    0,
  );
}

/** straight arms from shoulders down to a bar position */
function hangArms(b: { shoulderL: Pt; shoulderR: Pt }, barF: number, barY: number) {
  const mk = (s: Pt, lat: number) => {
    const wrist = pt(barF, barY, lat);
    const elbow = pt(lerp(s.f, wrist.f, 0.48), lerp(s.y, wrist.y, 0.48), lat);
    return { elbow, wrist };
  };
  const L = mk(b.shoulderL, b.shoulderL.lat + 0.012);
  const R = mk(b.shoulderR, b.shoulderR.lat - 0.012);
  return { elbowL: L.elbow, wristL: L.wrist, elbowR: R.elbow, wristR: R.wrist };
}

// ---------------- per-exercise generators ----------------

function squatPose(cyclePos: number, F: Required<FaultLevels>, nz: (k: number) => number): Body {
  const m = movement(cyclePos) * (1 - 0.35 * F.shallow);
  const σ = 27 * m + nz(1) * 0.7;
  const k = 174 - m * 108 + nz(2) * 1.2; // 174 → 66 (hip crease reaches the knee)
  const h = 176 - m * 106; // 176 → 70
  const rounding = F.spineRound * m;
  const valgusIn = F.kneeValgus * m * 0.058;
  const asymK = F.asymmetry * m * 10;

  const b = chain(σ, k, h, {
    lat: FRONT_LAT,
    latScaleKnee: [-valgusIn, valgusIn * 1.15], // knees pull toward midline
    rounding,
    sideDelta: { kL: asymK, kR: 0 },
  });
  const nose = headFrom(b.shoulderMid, b.torsoTilt, rounding);
  // bar racked on the traps: hands just outside shoulders, elbows down-back
  const arms = {
    elbowL: pt(b.shoulderL.f - 0.028, b.shoulderL.y + 0.085, b.shoulderL.lat + 0.045),
    elbowR: pt(b.shoulderR.f - 0.028, b.shoulderR.y + 0.085, b.shoulderR.lat - 0.045),
    wristL: pt(b.shoulderL.f + 0.012, b.shoulderL.y - 0.018, b.shoulderL.lat + 0.07),
    wristR: pt(b.shoulderR.f + 0.012, b.shoulderR.y - 0.018, b.shoulderR.lat - 0.07),
  };
  return { ...b, ...arms, nose };
}

function deadliftPose(cyclePos: number, F: Required<FaultLevels>, nz: (k: number) => number): Body {
  // cycle 0 = bar on the floor
  let lift = movement(cyclePos); // 0 floor → 1 lockout → 0
  // hips shooting up: early concentric extends the knees ahead of the hips
  const shootWin = Math.max(0, 1 - Math.abs(cyclePos - 0.18) / 0.18);
  const σ = 17 * (1 - lift) + nz(1) * 0.6;
  const k = lerp(112, 174, Math.min(1, lift + F.hipShoot * shootWin * 0.5)) + nz(2);
  const h = lerp(72, 174, lift) - F.hipShoot * shootWin * 14;
  // the fault script's window already confines rounding to the early pull,
  // so no extra bar-height attenuation — it would double-discount the fault
  const rounding = F.spineRound;

  const b = chain(σ, k, h, { lat: SIDE_LAT, rounding });
  const nose = headFrom(b.shoulderMid, b.torsoTilt, rounding);
  const barF = P.stance * 0 + 0.02 + F.barDrift * 0.05 * (1 - lift * 0.5) + nz(3) * 0.004;
  const barY = lerp(P.groundY - 0.055, P.groundY - 0.395, lift);
  return { ...b, ...hangArms(b, barF, barY), nose };
}

function rdlPose(cyclePos: number, F: Required<FaultLevels>, nz: (k: number) => number): Body {
  const m = movement(cyclePos) * (1 - 0.3 * F.shallow); // 0 standing → 1 deep hinge
  const σ = 4 + nz(1) * 0.5;
  const k = 168 - m * 12; // soft, nearly fixed knees
  const h = lerp(176, 92, m);
  const rounding = F.spineRound * m;
  const b = chain(σ, k, h, { lat: SIDE_LAT, rounding });
  const nose = headFrom(b.shoulderMid, b.torsoTilt, rounding);
  const barF = 0.015 + F.barDrift * 0.04 * m;
  const barY = lerp(P.groundY - 0.38, P.groundY - 0.2, m);
  return { ...b, ...hangArms(b, barF, barY), nose };
}

function rowPose(cyclePos: number, F: Required<FaultLevels>, nz: (k: number) => number): Body {
  const pull = movement(cyclePos); // 0 arms long → 1 bar at chest
  const heaveSwing = F.heave * Math.sin(cyclePos * Math.PI * 2) * 9;
  const σ = 8 + nz(1) * 0.5;
  const k = 152 + nz(2) * 0.8;
  const h = 96 - heaveSwing; // hinge held; heave swings it
  const rounding = F.spineRound * 0.8;
  const b = chain(σ, k, h, { lat: SIDE_LAT, rounding });
  const nose = headFrom(b.shoulderMid, b.torsoTilt, rounding);
  // bar hangs below the shoulders; pulling brings it to the lower chest
  const sh = b.shoulderMid;
  const armLen = P.upperArm + P.forearm;
  const barF = sh.f + 0.02 - pull * 0.01;
  const barY = sh.y + lerp(armLen * 0.98, armLen * 0.45, pull);
  const arms = hangArms(b, barF, barY);
  // elbows travel back past the torso as the bar comes up
  arms.elbowL.f -= pull * 0.05;
  arms.elbowR.f -= pull * 0.05;
  return { ...b, ...arms, nose };
}

function ohpPose(cyclePos: number, F: Required<FaultLevels>, nz: (k: number) => number): Body {
  const press = movement(cyclePos); // 0 rack → 1 lockout
  const σ = 2;
  const k = 174;
  const h = 174;
  const layback = F.layback * Math.max(press, 0.25);
  const b = chain(σ, k, h, { lat: FRONT_LAT, rounding: 0 });
  // layback: hips drift forward, shoulders compensate back
  const hipShift = layback * 0.045;
  b.hipL.f += hipShift; b.hipR.f += hipShift;
  b.shoulderL.f -= layback * 0.03; b.shoulderR.f -= layback * 0.03;
  b.shoulderMid.f -= layback * 0.03;
  const nose = headFrom(b.shoulderMid, -layback * 12, 0);

  const elevDeg = lerp(84, 177, press) + nz(2) * 1.5; // shoulderElev by construction
  const drift = F.barDrift * 0.045 * press;
  const stackErr = F.barDrift * 0.02;
  const mkArm = (s: Pt, latSign: number) => {
    const armTilt = (180 - elevDeg) * RAD; // 0 = straight up along torso
    const elbow = pt(
      s.f + P.upperArm * Math.sin(armTilt) + drift * 0.5,
      s.y - P.upperArm * Math.cos(armTilt),
      s.lat + latSign * 0.02,
    );
    const wrist = pt(
      elbow.f + drift * 0.5 + stackErr + (press < 0.15 ? -0.015 : 0),
      elbow.y - P.forearm * (0.55 + press * 0.45),
      s.lat + latSign * 0.028,
    );
    return { elbow, wrist };
  };
  const L = mkArm(b.shoulderL, 1);
  const R = mkArm(b.shoulderR, -1);
  return { ...b, elbowL: L.elbow, wristL: L.wrist, elbowR: R.elbow, wristR: R.wrist, nose };
}

function benchPose(cyclePos: number, F: Required<FaultLevels>, nz: (k: number) => number): Body {
  const press = 1 - movement(cyclePos); // 0 = bar at chest … start at lockout
  const benchY = 0.62;
  const hipF = -0.06;
  const shoulderF = 0.16; // head end is "forward" (+f = toward the head, drawn rightward)

  const hipL = pt(hipF, benchY + 0.005, 0.01);
  const hipR = pt(hipF, benchY + 0.005, -0.01);
  const kneeL = pt(hipF - 0.13, benchY + 0.05, 0.02);
  const kneeR = pt(hipF - 0.13, benchY + 0.05, -0.02);
  const ankleL = pt(hipF - 0.17, P.groundY, 0.026);
  const ankleR = pt(hipF - 0.17, P.groundY, -0.026);
  const shoulderL = pt(shoulderF, benchY - 0.02, 0.013);
  const shoulderR = pt(shoulderF, benchY - 0.02, -0.013);
  const nose = pt(shoulderF + 0.085, benchY - 0.035, 0);

  const flare = F.elbowFlare * 0.055; // elbows migrate toward the head
  const asym = F.asymmetry * 0.03;
  const elbowDrop = lerp(-0.155, 0.075, 1 - press); // vs shoulder y: lockout up, bottom below chest line
  const mkArm = (s: Pt, latSign: number, extra: number) => {
    const elbow = pt(s.f + 0.02 + flare, s.y + elbowDrop + extra, s.lat + latSign * 0.02);
    const wristY = press > 0.5 ? s.y - lerp(0.0, 0.24, (press - 0.5) * 2) : elbow.y - 0.06;
    const wrist = pt(s.f + 0.045 + F.barDrift * 0.05, wristY, s.lat + latSign * 0.024);
    return { elbow, wrist };
  };
  const L = mkArm(shoulderL, 1, 0);
  const R = mkArm(shoulderR, -1, asym);
  void nz;

  return {
    ankleL, ankleR, kneeL, kneeR, hipL, hipR,
    shoulderL, shoulderR,
    elbowL: L.elbow, wristL: L.wrist, elbowR: R.elbow, wristR: R.wrist,
    nose,
  };
}

// ---------------- projection ----------------

function project(b: Body, view: 'front' | 'side'): Landmark[] {
  const out: Landmark[] = new Array(LANDMARK_COUNT);
  for (let i = 0; i < LANDMARK_COUNT; i++) out[i] = { x: 0.5, y: 0.5, z: 0, v: 0 };

  const put = (idx: number, p: Pt, v = 1) => {
    if (view === 'side') {
      // figure faces +x; lateral becomes subtle depth
      out[idx] = { x: 0.47 + p.f, y: p.y, z: p.lat, v: p.lat < -0.001 ? 0.86 : v };
    } else {
      // frontal: lateral is x (mirrored: lifter's left on screen right), forward is toward camera
      out[idx] = { x: 0.5 + p.lat, y: p.y, z: -p.f, v };
    }
  };

  put(LM.nose, b.nose);
  put(LM.leftShoulder, b.shoulderL);
  put(LM.rightShoulder, b.shoulderR);
  put(LM.leftElbow, b.elbowL);
  put(LM.rightElbow, b.elbowR);
  put(LM.leftWrist, b.wristL);
  put(LM.rightWrist, b.wristR);
  put(LM.leftHip, b.hipL);
  put(LM.rightHip, b.hipR);
  put(LM.leftKnee, b.kneeL);
  put(LM.rightKnee, b.kneeR);
  put(LM.leftAnkle, b.ankleL);
  put(LM.rightAnkle, b.ankleR);

  // face cluster around the nose
  const n = b.nose;
  const face: [number, number, number][] = [
    [LM.leftEyeInner, 0.008, -0.012], [LM.leftEye, 0.013, -0.013], [LM.leftEyeOuter, 0.018, -0.012],
    [LM.rightEyeInner, -0.008, -0.012], [LM.rightEye, -0.013, -0.013], [LM.rightEyeOuter, -0.018, -0.012],
    [LM.leftEar, 0.026, -0.006], [LM.rightEar, -0.026, -0.006],
    [LM.mouthLeft, 0.008, 0.01], [LM.mouthRight, -0.008, 0.01],
  ];
  for (const [idx, lat, dy] of face) put(idx, pt(n.f, n.y + dy, n.lat + lat), 0.9);

  // hands just beyond the wrists, heels/toes around the ankles
  const hand = (w: Pt, e: Pt, latSign: number) => {
    const df = w.f - e.f;
    const dy = w.y - e.y;
    const dl = Math.hypot(df, dy) + 1e-6;
    return {
      idx: pt(w.f + (df / dl) * 0.03, w.y + (dy / dl) * 0.03, w.lat + latSign * 0.006),
      pinky: pt(w.f + (df / dl) * 0.028, w.y + (dy / dl) * 0.028, w.lat - latSign * 0.006),
      thumb: pt(w.f + (df / dl) * 0.018, w.y + (dy / dl) * 0.018, w.lat + latSign * 0.009),
    };
  };
  const hl = hand(b.wristL, b.elbowL, 1);
  const hr = hand(b.wristR, b.elbowR, -1);
  put(LM.leftIndex, hl.idx, 0.85); put(LM.leftPinky, hl.pinky, 0.85); put(LM.leftThumb, hl.thumb, 0.85);
  put(LM.rightIndex, hr.idx, 0.85); put(LM.rightPinky, hr.pinky, 0.85); put(LM.rightThumb, hr.thumb, 0.85);

  const foot = (a: Pt, latSign: number) => ({
    heel: pt(a.f - 0.028, a.y + 0.012, a.lat),
    toe: pt(a.f + 0.05, a.y + 0.014, a.lat + latSign * 0.004),
  });
  const fl = foot(b.ankleL, 1);
  const fr = foot(b.ankleR, -1);
  put(LM.leftHeel, fl.heel, 0.9); put(LM.leftFootIndex, fl.toe, 0.9);
  put(LM.rightHeel, fr.heel, 0.9); put(LM.rightFootIndex, fr.toe, 0.9);

  return out;
}

// ---------------- public API ----------------

const FAULT_DEFAULTS: Required<FaultLevels> = {
  spineRound: 0, kneeValgus: 0, barDrift: 0, layback: 0,
  elbowFlare: 0, heave: 0, hipShoot: 0, asymmetry: 0, shallow: 0,
};

export function generatePose(ex: ExerciseSpec, input: PoseGenInput): Landmark[] {
  const F = { ...FAULT_DEFAULTS, ...(input.faults ?? {}) };
  const w = input.wobble ?? 0;
  const tN = input.noiseT ?? 0;
  const nz = (k: number) => noise(tN, k) * w;

  let body: Body;
  switch (ex.id) {
    case 'deadlift': body = deadliftPose(input.cyclePos, F, nz); break;
    case 'rdl': body = rdlPose(input.cyclePos, F, nz); break;
    case 'barbell_row': body = rowPose(input.cyclePos, F, nz); break;
    case 'overhead_press': body = ohpPose(input.cyclePos, F, nz); break;
    case 'bench_press': body = benchPose(input.cyclePos, F, nz); break;
    case 'back_squat':
    default: body = squatPose(input.cyclePos, F, nz); break;
  }
  return project(body, ex.view);
}

/** The "get into position" ghost target — the exercise's start pose, clean. */
export function ghostPose(ex: ExerciseSpec): Landmark[] {
  return generatePose(ex, { cyclePos: 0, faults: {}, wobble: 0 });
}
