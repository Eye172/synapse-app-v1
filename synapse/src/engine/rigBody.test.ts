import { LM, type RigNodeId, type SensorFrame } from '@/src/engine/types';

import { quatNormalize, vNormalize, type Quat, type Vec3 } from './quaternion';
import {
  CalibrationCollector,
  RigCalibration,
  rigBodyState,
  rigLandmarks,
  rigMetrics,
} from './rigBody';

/** Shortest-arc rotation taking `from` onto `to` — the inverse of what rigBody does. */
function quatFromTo(from: Vec3, to: Vec3): Quat {
  const dot = from.x * to.x + from.y * to.y + from.z * to.z;
  if (dot > 0.999999) return [1, 0, 0, 0];
  if (dot < -0.999999) {
    // exact half turn (arms hanging → straight overhead): any perpendicular axis
    const seed = Math.abs(from.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const perp = vNormalize({
      x: from.y * seed.z - from.z * seed.y,
      y: from.z * seed.x - from.x * seed.z,
      z: from.x * seed.y - from.y * seed.x,
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

const UP: Vec3 = { x: 0, y: 1, z: 0 };
const DOWN: Vec3 = { x: 0, y: -1, z: 0 };

/** Build a frame that puts each segment along a chosen direction. */
function frameFor(dirs: Partial<Record<RigNodeId, Vec3>>, t = 1000): SensorFrame {
  const neutral: Record<RigNodeId, Vec3> = {
    back: UP,
    leftArm: DOWN,
    rightArm: DOWN,
    leftLeg: DOWN,
    rightLeg: DOWN,
  };
  return {
    t,
    protocol: 'v2-named',
    flags: { alert: false },
    nodes: (Object.keys(dirs) as RigNodeId[]).map((id) => {
      const q = quatFromTo(neutral[id], vNormalize(dirs[id]!));
      return { id, quat: [q[0], q[1], q[2], q[3]] as [number, number, number, number] };
    }),
  };
}

const IDENTITY_CAL = new RigCalibration();

describe('rigBodyState — orientation round-trip', () => {
  it('reconstructs the exact segment direction a sensor was posed at', () => {
    const target = vNormalize({ x: 0.3, y: 0.9, z: 0.2 });
    const state = rigBodyState(frameFor({ back: target }), IDENTITY_CAL);
    const dir = state.segments.back!.dir;
    expect(dir.x).toBeCloseTo(target.x, 5);
    expect(dir.y).toBeCloseTo(target.y, 5);
    expect(dir.z).toBeCloseTo(target.z, 5);
  });

  it('reports how far each segment moved from neutral', () => {
    // trunk tipped 30° forward
    const tilted = vNormalize({ x: 0, y: Math.cos(Math.PI / 6), z: Math.sin(Math.PI / 6) });
    const state = rigBodyState(frameFor({ back: tilted }), IDENTITY_CAL);
    expect(state.segments.back!.deltaDeg).toBeCloseTo(30, 1);
  });

  it('ignores nodes that report no orientation', () => {
    const frame: SensorFrame = {
      t: 1,
      protocol: 'v0',
      flags: {},
      nodes: [{ id: 'back', angleDeg: 41.7 }],
    };
    expect(Object.keys(rigBodyState(frame, IDENTITY_CAL).segments)).toHaveLength(0);
  });
});

describe('calibration makes the model mounting-agnostic', () => {
  it('zeroes an arbitrarily mounted sensor back to the anatomical neutral', () => {
    // the strap sits rotated 40° off-axis; the neutral capture absorbs it
    const mounted = vNormalize({ x: 0.6, y: 0.7, z: 0.4 });
    const neutralFrame = frameFor({ back: mounted });

    const collector = new CalibrationCollector();
    for (let i = 0; i < 10; i++) collector.add(neutralFrame);
    const cal = collector.build()!;
    expect(cal).not.toBeNull();
    expect(cal.isCalibrated).toBe(true);

    // standing still in that same pose must now read as perfectly upright
    const state = rigBodyState(neutralFrame, cal);
    expect(state.segments.back!.deltaDeg).toBeCloseTo(0, 3);
    expect(rigMetrics(state).torsoLean).toBeCloseTo(0, 3);
  });

  it('refuses to calibrate without the back node, which anchors the body', () => {
    const collector = new CalibrationCollector();
    for (let i = 0; i < 10; i++) collector.add(frameFor({ leftLeg: DOWN }));
    expect(collector.build()).toBeNull();
  });

  it('survives a round-trip through storage', () => {
    const collector = new CalibrationCollector();
    for (let i = 0; i < 10; i++) collector.add(frameFor({ back: UP, leftLeg: DOWN }));
    const cal = collector.build()!;
    const restored = RigCalibration.fromJSON(JSON.parse(JSON.stringify(cal.toJSON())));
    expect(restored.isCalibrated).toBe(true);
    expect(restored.reference('back')).toEqual(cal.reference('back'));
  });

  it('ignores corrupt stored calibration instead of throwing', () => {
    expect(RigCalibration.fromJSON(null).isCalibrated).toBe(false);
    expect(RigCalibration.fromJSON({ back: 'nope' }).isCalibrated).toBe(false);
    expect(RigCalibration.fromJSON({ back: [1, 2] }).isCalibrated).toBe(false);
  });
});

describe('rigMetrics — only what five IMUs can actually see', () => {
  it('measures trunk lean against the calibrated upright', () => {
    const lean = vNormalize({ x: 0, y: Math.cos(Math.PI / 4), z: Math.sin(Math.PI / 4) });
    const m = rigMetrics(rigBodyState(frameFor({ back: lean }), IDENTITY_CAL));
    expect(m.torsoLean).toBeCloseTo(45, 1);
  });

  it('measures the hip as the true trunk-to-thigh angle', () => {
    // standing: trunk up, thighs down → the joint is wide open
    const standing = rigMetrics(rigBodyState(frameFor({ back: UP, leftLeg: DOWN, rightLeg: DOWN }), IDENTITY_CAL));
    expect(standing.hipAngle).toBeCloseTo(180, 1);

    // hinged: trunk horizontal, thighs still down → a right angle at the hip
    const hinge = vNormalize({ x: 0, y: 0, z: 1 });
    const hinged = rigMetrics(rigBodyState(frameFor({ back: hinge, leftLeg: DOWN, rightLeg: DOWN }), IDENTITY_CAL));
    expect(hinged.hipAngle).toBeCloseTo(90, 1);
  });

  it('measures shoulder elevation from hanging to overhead', () => {
    const hanging = rigMetrics(rigBodyState(frameFor({ back: UP, leftArm: DOWN, rightArm: DOWN }), IDENTITY_CAL));
    expect(hanging.shoulderElev).toBeCloseTo(0, 1);

    const overhead = rigMetrics(rigBodyState(frameFor({ back: UP, leftArm: UP, rightArm: UP }), IDENTITY_CAL));
    expect(overhead.shoulderElev).toBeCloseTo(180, 1);
  });

  it('scores a wide but even stance as symmetric', () => {
    // both thighs splayed outward by the same amount — correct, not a fault
    const left = vNormalize({ x: 0.35, y: -1, z: 0 });
    const right = vNormalize({ x: -0.35, y: -1, z: 0 });
    const m = rigMetrics(rigBodyState(frameFor({ back: UP, leftLeg: left, rightLeg: right }), IDENTITY_CAL));
    expect(m.symmetry).toBeGreaterThan(95);
  });

  it('penalizes one side working harder than the other', () => {
    const left = vNormalize({ x: 0, y: -1, z: 0.7 }); // driving forward
    const right = DOWN; // idle
    const m = rigMetrics(rigBodyState(frameFor({ back: UP, leftLeg: left, rightLeg: right }), IDENTITY_CAL));
    expect(m.symmetry!).toBeLessThan(60);
  });

  it('reads inward thigh collapse as valgus and ignores outward tracking', () => {
    const caveIn = rigMetrics(
      rigBodyState(
        // both knees drifting toward the midline
        frameFor({ back: UP, leftLeg: vNormalize({ x: -0.4, y: -1, z: 0 }), rightLeg: vNormalize({ x: 0.4, y: -1, z: 0 }) }),
        IDENTITY_CAL,
      ),
    );
    expect(caveIn.kneeValgus!).toBeGreaterThan(15);

    const trackOut = rigMetrics(
      rigBodyState(
        frameFor({ back: UP, leftLeg: vNormalize({ x: 0.4, y: -1, z: 0 }), rightLeg: vNormalize({ x: -0.4, y: -1, z: 0 }) }),
        IDENTITY_CAL,
      ),
    );
    expect(trackOut.kneeValgus).toBe(0);
  });

  it('says nothing about joints it has no sensor across', () => {
    const m = rigMetrics(rigBodyState(frameFor({ back: UP, leftArm: DOWN, leftLeg: DOWN }), IDENTITY_CAL));
    // knee and elbow flexion need a second IMU below the joint — absent here
    expect(m).not.toHaveProperty('kneeAngle');
    expect(m).not.toHaveProperty('elbowAngle');
  });

  it('returns nulls rather than guesses when the rig is silent', () => {
    const m = rigMetrics({ t: 0, segments: {}, calibrated: false });
    expect(m.torsoLean).toBeNull();
    expect(m.hipAngle).toBeNull();
    expect(m.symmetry).toBeNull();
  });
});

describe('rigLandmarks — the exoskeleton draws a body', () => {
  it('places a full standing skeleton from five nodes', () => {
    const lms = rigLandmarks(
      rigBodyState(frameFor({ back: UP, leftArm: DOWN, rightArm: DOWN, leftLeg: DOWN, rightLeg: DOWN }), IDENTITY_CAL),
    );
    expect(lms).toHaveLength(33);
    const shoulder = lms[LM.leftShoulder]!;
    const hip = lms[LM.leftHip]!;
    const knee = lms[LM.leftKnee]!;
    // screen y grows downward: shoulders above hips above knees
    expect(shoulder.y).toBeLessThan(hip.y);
    expect(hip.y).toBeLessThan(knee.y);
    expect(shoulder.v).toBe(1);
  });

  it('marks points it inferred rather than measured', () => {
    const lms = rigLandmarks(rigBodyState(frameFor({ back: UP, leftLeg: DOWN, leftArm: DOWN }), IDENTITY_CAL));
    // measured: a thigh IMU places the knee
    expect(lms[LM.leftKnee]!.est).toBeUndefined();
    // inferred: no shin or forearm IMU exists, so these are drawn but not measured
    expect(lms[LM.leftAnkle]!.est).toBe(true);
    expect(lms[LM.leftWrist]!.est).toBe(true);
  });

  it('bends the body when the trunk hinges', () => {
    const upright = rigLandmarks(rigBodyState(frameFor({ back: UP }), IDENTITY_CAL));
    const hinged = rigLandmarks(
      rigBodyState(frameFor({ back: vNormalize({ x: 0, y: 0.4, z: 1 }) }), IDENTITY_CAL),
    );
    // hinging drops the shoulders toward the hips on screen
    expect(hinged[LM.leftShoulder]!.y).toBeGreaterThan(upright[LM.leftShoulder]!.y);
  });

  it('degrades honestly when nodes drop out', () => {
    const lms = rigLandmarks(rigBodyState(frameFor({ back: UP }), IDENTITY_CAL));
    // no leg node: the knee is a placeholder, flagged and low-confidence
    expect(lms[LM.leftKnee]!.est).toBe(true);
    expect(lms[LM.leftKnee]!.v).toBeLessThan(0.35);
  });
});
