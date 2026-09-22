import { LM, type Landmark } from '@/src/engine/types';

import { OneEuroFilter } from './oneEuro';
import { BodyMeasure, defaultProportions } from './proportions';
import { PoseTracker, rigidify } from './tracker';
import type { PoseObservation, WorldPoint } from './types';

function bodyAt(t: number, wobble = 0): WorldPoint[] {
  const p = defaultProportions(1.75);
  const pt = (x: number, y: number, z: number, v = 1): WorldPoint => ({ x, y, z, v });
  const n = () => (wobble === 0 ? 0 : (Math.sin(t * 0.37 + wobble) * wobble));
  const out: WorldPoint[] = [];
  for (let i = 0; i < 33; i++) out.push(pt(0, 0, 0, 0));
  const hw = p.hipWidth / 2;
  const sw = p.shoulderWidth / 2;
  out[LM.leftHip] = pt(-hw + n(), n(), n());
  out[LM.rightHip] = pt(hw + n(), n(), n());
  out[LM.leftShoulder] = pt(-sw + n(), p.trunkLength + n(), n());
  out[LM.rightShoulder] = pt(sw + n(), p.trunkLength + n(), n());
  out[LM.leftElbow] = pt(-sw, p.trunkLength - p.upperArm + n(), 0);
  out[LM.rightElbow] = pt(sw, p.trunkLength - p.upperArm + n(), 0);
  out[LM.leftWrist] = pt(-sw, p.trunkLength - p.upperArm - p.forearm + n(), 0);
  out[LM.rightWrist] = pt(sw, p.trunkLength - p.upperArm - p.forearm + n(), 0);
  out[LM.leftKnee] = pt(-hw, -p.thigh + n(), 0);
  out[LM.rightKnee] = pt(hw, -p.thigh + n(), 0);
  out[LM.leftAnkle] = pt(-hw, -p.thigh - p.shin + n(), 0);
  out[LM.rightAnkle] = pt(hw, -p.thigh - p.shin + n(), 0);
  return out;
}

function obsAt(t: number, wobble = 0): PoseObservation {
  const world = bodyAt(t, wobble);
  const image: Landmark[] = world.map((w) => ({
    x: 0.5 + w.x * 0.3,
    y: 0.5 - w.y * 0.3,
    z: w.z * 0.3,
    v: w.v,
  }));
  return { t, image, world, frame: { width: 720, height: 1280 } };
}

describe('OneEuroFilter', () => {
  it('passes the first sample through untouched', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0.01, dCutoff: 1, vGate: 0 });
    expect(f.filter(4.2, 0)).toBe(4.2);
  });

  it('cuts jitter on a signal that is not going anywhere', () => {
    const f = new OneEuroFilter({ minCutoff: 0.6, beta: 0.01, dCutoff: 1, vGate: 0 });
    let worst = 0;
    for (let i = 0; i < 120; i++) {
      const noise = (i % 2 === 0 ? 1 : -1) * 0.01;
      const out = f.filter(1 + noise, i * 33);
      if (i > 20) worst = Math.max(worst, Math.abs(out - 1));
    }
    // a centimetre of detector noise must not become a centimetre of shake
    expect(worst).toBeLessThan(0.003);
  });

  it('trails a moving signal by about one time constant', () => {
    // the lag of a first-order filter is 1/(2*pi*cutoff) seconds, and that
    // is the whole reason beta has to be large: at a hundredth of the right
    // value the cutoff barely opens and the overlay drifts off the lifter
    const slow = new OneEuroFilter({ minCutoff: 0.6, beta: 0.02, dCutoff: 1, vGate: 0 });
    const fast = new OneEuroFilter({ minCutoff: 0.7, beta: 7, dCutoff: 1, vGate: 0 });
    let slowOut = 0;
    let fastOut = 0;
    for (let i = 0; i < 90; i++) {
      slowOut = slow.filter(i * 0.02, i * 33);
      fastOut = fast.filter(i * 0.02, i * 33);
    }
    const truth = 89 * 0.02;
    const slowLagMs = ((truth - slowOut) / 0.606) * 1000;
    const fastLagMs = ((truth - fastOut) / 0.606) * 1000;
    expect(slowLagMs).toBeGreaterThan(100);
    expect(fastLagMs).toBeLessThan(45);
  });

  it('lands on the signal once prediction is added, which is how it ships', () => {
    // the tracker never reads the filter bare — it always asks where the
    // joint will be when the frame is actually drawn
    const f = new OneEuroFilter({ minCutoff: 0.7, beta: 7, dCutoff: 1, vGate: 0 });
    for (let i = 0; i < 90; i++) f.filter(i * 0.02, i * 33);
    const predicted = f.predict(33)!;
    // one frame on, the true value is 90 * 0.02
    expect(Math.abs(predicted - 90 * 0.02)).toBeLessThan(0.006);
  });

  it('extrapolates in the direction it is travelling', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0.5, dCutoff: 1, vGate: 0 });
    for (let i = 0; i < 30; i++) f.filter(i * 0.05, i * 33);
    const now = f.value!;
    expect(f.predict(33)!).toBeGreaterThan(now);
  });

  it('does not amplify noise into shake while the signal is still', () => {
    // velocity estimated from noise is not lag worth undoing
    const gated = new OneEuroFilter({ minCutoff: 0.7, beta: 7, dCutoff: 1, vGate: 0.06 });
    const ungated = new OneEuroFilter({ minCutoff: 0.7, beta: 7, dCutoff: 1, vGate: 0 });
    let gatedWorst = 0;
    let ungatedWorst = 0;
    for (let i = 0; i < 120; i++) {
      const noisy = 1 + (i % 2 === 0 ? 0.004 : -0.004);
      gated.filter(noisy, i * 33);
      ungated.filter(noisy, i * 33);
      if (i > 30) {
        gatedWorst = Math.max(gatedWorst, Math.abs(gated.predict(16)! - 1));
        ungatedWorst = Math.max(ungatedWorst, Math.abs(ungated.predict(16)! - 1));
      }
    }
    expect(gatedWorst).toBeLessThan(0.002);
    expect(gatedWorst).toBeLessThan(ungatedWorst);
  });

  it('still undoes its lag once the signal really moves', () => {
    const f = new OneEuroFilter({ minCutoff: 0.7, beta: 7, dCutoff: 1, vGate: 0.06 });
    for (let i = 0; i < 90; i++) f.filter(i * 0.02, i * 33);
    // 0.02 per 33 ms is 0.6 m/s, far above the gate, so it passes through
    expect(Math.abs(f.predict(33)! - 90 * 0.02)).toBeLessThan(0.006);
  });

  it('survives a repeated timestamp', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0.01, dCutoff: 1, vGate: 0 });
    f.filter(1, 100);
    expect(Number.isFinite(f.filter(2, 100))).toBe(true);
  });

  it('invents no velocity when the clock jumps backwards', () => {
    // a scrubbed video, a restarted camera, frames arriving out of order
    const f = new OneEuroFilter({ minCutoff: 0.7, beta: 7, dCutoff: 1, vGate: 0.06 });
    for (let i = 0; i < 40; i++) f.filter(i * 0.02, 5000 + i * 33);
    f.filter(0.2, 900);
    expect(f.velocity).toBe(0);
    // and the estimate is the sample itself, not a place it was predicted to
    expect(f.predict(33)).toBeCloseTo(0.2, 6);
  });

  it('invents no velocity after a long gap', () => {
    const f = new OneEuroFilter({ minCutoff: 0.7, beta: 7, dCutoff: 1, vGate: 0.06 });
    for (let i = 0; i < 40; i++) f.filter(i * 0.02, i * 33);
    // the app was in the background for two seconds
    f.filter(1.0, 40 * 33 + 2000);
    expect(f.velocity).toBe(0);
    expect(f.value).toBeCloseTo(1.0, 6);
  });

  it('carries on normally once time behaves again', () => {
    const f = new OneEuroFilter({ minCutoff: 0.7, beta: 7, dCutoff: 1, vGate: 0.06 });
    f.filter(0, 0);
    f.filter(5, 9999);           // a jump
    for (let i = 1; i < 60; i++) f.filter(5 + i * 0.02, 9999 + i * 33);
    expect(Math.abs(f.predict(33)! - (5 + 60 * 0.02))).toBeLessThan(0.01);
  });
});

describe('BodyMeasure', () => {
  it('recovers the bone lengths of the body it watched', () => {
    const m = new BodyMeasure();
    const truth = defaultProportions(1.75);
    for (let i = 0; i < 40; i++) m.observe(bodyAt(i));
    const p = m.proportions;
    expect(p.height).toBeCloseTo(1.75, 1);
    expect(p.shoulderWidth).toBeCloseTo(truth.shoulderWidth, 2);
    expect(p.thigh).toBeCloseTo(truth.thigh, 2);
    expect(p.confidence).toBeGreaterThan(0.9);
  });

  it('measures a different person differently', () => {
    const a = new BodyMeasure();
    const b = new BodyMeasure();
    for (let i = 0; i < 40; i++) {
      a.observe(bodyAt(i));
      const tall = bodyAt(i).map((w) => ({ ...w, x: w.x * 1.2, y: w.y * 1.2, z: w.z * 1.2 }));
      b.observe(tall);
    }
    expect(b.proportions.height / a.proportions.height).toBeCloseTo(1.2, 1);
  });

  it('knows it has measured nothing before it sees anything', () => {
    expect(new BodyMeasure().proportions.confidence).toBe(0);
  });

  it('is not shortened by a limb pointing at the camera', () => {
    const m = new BodyMeasure();
    for (let i = 0; i < 30; i++) m.observe(bodyAt(i));
    const full = m.proportions.thigh;
    // the lifter turns, and the thighs foreshorten to a third
    for (let i = 30; i < 60; i++) {
      const squashed = bodyAt(i).map((w, idx) =>
        idx === LM.leftKnee || idx === LM.rightKnee
          ? { ...w, y: w.y * 0.33 }
          : w,
      );
      m.observe(squashed);
    }
    expect(m.proportions.thigh).toBeCloseTo(full, 2);
  });
});

describe('rigidify', () => {
  it('holds bones to their measured lengths', () => {
    const p = defaultProportions(1.75);
    const stretched = bodyAt(0).map((w, i) =>
      i === LM.leftKnee ? { ...w, y: w.y * 1.4 } : w,
    );
    const fixed = rigidify(stretched, p);
    const hip = fixed[LM.leftHip]!;
    const knee = fixed[LM.leftKnee]!;
    expect(Math.hypot(knee.x - hip.x, knee.y - hip.y, knee.z - hip.z)).toBeCloseTo(p.thigh, 6);
  });

  it('keeps the direction the detector found', () => {
    const p = defaultProportions(1.75);
    const world = bodyAt(0);
    world[LM.leftKnee] = { x: -0.3, y: -0.2, z: 0.1, v: 1 };
    const fixed = rigidify(world, p);
    const before = { x: world[LM.leftKnee]!.x - world[LM.leftHip]!.x, y: world[LM.leftKnee]!.y - world[LM.leftHip]!.y };
    const after = { x: fixed[LM.leftKnee]!.x - fixed[LM.leftHip]!.x, y: fixed[LM.leftKnee]!.y - fixed[LM.leftHip]!.y };
    expect(Math.atan2(after.y, after.x)).toBeCloseTo(Math.atan2(before.y, before.x), 6);
  });

  it('leaves joints it cannot see alone', () => {
    const p = defaultProportions(1.75);
    const world = bodyAt(0);
    const fixed = rigidify(world, p);
    // the wrists were never given visibility in this fixture
    expect(fixed[LM.leftPinky]!.v).toBe(0);
  });

  it('squares the shoulder line to the spine', () => {
    const p = defaultProportions(1.75);
    const world = bodyAt(0);
    const fixed = rigidify(world, p);
    const hipC = {
      x: (fixed[LM.leftHip]!.x + fixed[LM.rightHip]!.x) / 2,
      y: (fixed[LM.leftHip]!.y + fixed[LM.rightHip]!.y) / 2,
      z: (fixed[LM.leftHip]!.z + fixed[LM.rightHip]!.z) / 2,
    };
    const shC = {
      x: (fixed[LM.leftShoulder]!.x + fixed[LM.rightShoulder]!.x) / 2,
      y: (fixed[LM.leftShoulder]!.y + fixed[LM.rightShoulder]!.y) / 2,
      z: (fixed[LM.leftShoulder]!.z + fixed[LM.rightShoulder]!.z) / 2,
    };
    const up = { x: shC.x - hipC.x, y: shC.y - hipC.y, z: shC.z - hipC.z };
    const across = {
      x: fixed[LM.rightShoulder]!.x - fixed[LM.leftShoulder]!.x,
      y: fixed[LM.rightShoulder]!.y - fixed[LM.leftShoulder]!.y,
      z: fixed[LM.rightShoulder]!.z - fixed[LM.leftShoulder]!.z,
    };
    const d = (up.x * across.x + up.y * across.y + up.z * across.z) /
      (Math.hypot(up.x, up.y, up.z) * Math.hypot(across.x, across.y, across.z));
    expect(Math.abs(d)).toBeLessThan(1e-9);
    expect(Math.hypot(across.x, across.y, across.z)).toBeCloseTo(p.shoulderWidth, 6);
  });
});

describe('PoseTracker', () => {
  it('draws nothing before it has seen anybody', () => {
    expect(new PoseTracker().sample(0)).toBeNull();
  });

  it('smooths detector jitter out of the figure', () => {
    const shaky = new PoseTracker();
    let worst = 0;
    for (let i = 0; i < 90; i++) {
      // a millimetre of noise on every joint, every frame
      const o = obsAt(i * 33);
      const jittered = {
        ...o,
        world: o.world!.map((w, k) => ({
          ...w,
          x: w.x + (k % 2 ? 1 : -1) * 0.004,
          y: w.y + (i % 2 ? 1 : -1) * 0.004,
        })),
      };
      shaky.update(jittered);
      if (i > 30) {
        const s = shaky.sample(i * 33)!;
        worst = Math.max(worst, Math.abs(s.world[LM.leftShoulder]!.y - defaultProportions(1.75).trunkLength));
      }
    }
    expect(worst).toBeLessThan(0.004);
  });

  it('reports how much of the body it can see', () => {
    const t = new PoseTracker();
    t.update(obsAt(0));
    const s = t.sample(0)!;
    expect(s.coverage).toBeGreaterThan(0.2);
    expect(s.coverage).toBeLessThan(1);
  });

  it('carries the pose forward when the camera falls behind', () => {
    const t = new PoseTracker();
    for (let i = 0; i < 20; i++) {
      const o = obsAt(i * 50);
      // the whole body drifts steadily to the right
      const moving = {
        ...o,
        world: o.world!.map((w) => ({ ...w, x: w.x + i * 0.02 })),
        image: o.image.map((l) => ({ ...l, x: l.x + i * 0.006 })),
      };
      t.update(moving);
    }
    const now = t.sample(950)!;
    const later = t.sample(1000)!;
    expect(later.age).toBeGreaterThan(now.age);
    expect(later.image[LM.leftShoulder]!.x).toBeGreaterThan(now.image[LM.leftShoulder]!.x);
  });

  it('refuses to extrapolate indefinitely', () => {
    const t = new PoseTracker();
    for (let i = 0; i < 20; i++) t.update(obsAt(i * 50));
    // long after the detector went quiet, every joint has been dropped
    const stale = t.sample(20 * 50 + 4000)!;
    expect(stale.coverage).toBe(0);
  });

  it('measures the person while it tracks them', () => {
    const t = new PoseTracker();
    for (let i = 0; i < 40; i++) t.update(obsAt(i * 33));
    expect(t.proportions.height).toBeCloseTo(1.75, 1);
    expect(t.proportions.confidence).toBeGreaterThan(0.9);
  });

  it('hands back a skeleton with honest bone lengths', () => {
    const t = new PoseTracker();
    for (let i = 0; i < 40; i++) t.update(obsAt(i * 33));
    const s = t.sample(40 * 33)!;
    const hip = s.world[LM.leftHip]!;
    const knee = s.world[LM.leftKnee]!;
    expect(Math.hypot(knee.x - hip.x, knee.y - hip.y, knee.z - hip.z)).toBeCloseTo(s.proportions.thigh, 6);
  });
});
