import { EXERCISES } from '@/src/data/exercises';
import { deriveMetrics, MetricTracker } from '@/src/engine/poseMetrics';
import { generatePose } from '@/src/sources/sim/kinematics';

describe('seed exercise library', () => {
  it('ships exactly the six briefed lifts', () => {
    expect(EXERCISES.map((e) => e.id).sort()).toEqual(
      ['back_squat', 'barbell_row', 'bench_press', 'deadlift', 'overhead_press', 'rdl'].sort(),
    );
  });

  it('every rule references a real metric and has sane bands', () => {
    for (const ex of EXERCISES) {
      expect(ex.rules.length).toBeGreaterThanOrEqual(3);
      for (const r of ex.rules) {
        if (r.kind === 'range') {
          expect(r.ok).toBeDefined();
          expect(r.warn).toBeDefined();
          const [okLo, okHi] = r.ok!;
          const [wLo, wHi] = r.warn!;
          expect(okLo).toBeLessThanOrEqual(okHi);
          // warn must contain ok
          expect(wLo).toBeLessThanOrEqual(okLo);
          expect(wHi).toBeGreaterThanOrEqual(okHi);
        } else {
          expect(typeof r.expected).toBe('boolean');
        }
        expect(r.cue.split(/\s+/).length).toBeLessThanOrEqual(8);
      }
      const risky = ex.rules.filter((r) => r.risk !== null);
      if (ex.riskLevel === 3) expect(risky.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('kinematics ↔ metric consistency', () => {
  function metricsAt(exId: string, cyclePos: number, faults = {}) {
    const ex = EXERCISES.find((e) => e.id === exId)!;
    const tracker = new MetricTracker();
    const lm = generatePose(ex, { cyclePos, faults });
    return deriveMetrics(lm, 0, tracker);
  }

  it('squat rep range crosses the counter thresholds', () => {
    const ex = EXERCISES.find((e) => e.id === 'back_squat')!;
    const top = metricsAt('back_squat', 0);
    const bottom = metricsAt('back_squat', 0.5);
    expect(top.kneeAngle).not.toBeNull();
    // the counter's zones are top-hyst / bottom+hyst — the sim must clear both
    expect(top.kneeAngle!).toBeGreaterThan(ex.rep.topAngle - ex.rep.hysteresis);
    expect(bottom.kneeAngle!).toBeLessThan(ex.rep.bottomAngle + ex.rep.hysteresis);
  });

  it('deadlift hip angle spans bottom→lockout', () => {
    const ex = EXERCISES.find((e) => e.id === 'deadlift')!;
    const floor = metricsAt('deadlift', 0);
    const lockout = metricsAt('deadlift', 0.5);
    expect(floor.hipAngle!).toBeLessThan(ex.rep.bottomAngle + ex.rep.hysteresis);
    expect(lockout.hipAngle!).toBeGreaterThan(ex.rep.topAngle - ex.rep.hysteresis);
  });

  it('clean squat grades clean; valgus fault pushes kneeValgus into error band', () => {
    const clean = metricsAt('back_squat', 0.5);
    expect(clean.kneeValgus!).toBeLessThan(8);
    const faulted = metricsAt('back_squat', 0.5, { kneeValgus: 1 });
    expect(faulted.kneeValgus!).toBeGreaterThan(15);
  });

  it('spine rounding collapses spineFlex under the deadlift error threshold', () => {
    const clean = metricsAt('deadlift', 0.1);
    const rounded = metricsAt('deadlift', 0.1, { spineRound: 1 });
    expect(clean.spineFlex!).toBeGreaterThan(45);
    expect(rounded.spineFlex!).toBeLessThan(45);
  });

  it('squat depth registers at the bottom, not at the top', () => {
    const top = metricsAt('back_squat', 0);
    const bottom = metricsAt('back_squat', 0.5);
    expect(top.hipBelowKnee).toBe(false);
    expect(bottom.hipBelowKnee).toBe(true);
  });

  it('press elevation spans rack→lockout', () => {
    const ex = EXERCISES.find((e) => e.id === 'overhead_press')!;
    const rack = metricsAt('overhead_press', 0);
    const lock = metricsAt('overhead_press', 0.5);
    expect(rack.shoulderElev!).toBeLessThan(ex.rep.bottomAngle + ex.rep.hysteresis);
    expect(lock.shoulderElev!).toBeGreaterThan(ex.rep.topAngle - ex.rep.hysteresis);
  });

  it('all six exercises produce a visible 33-landmark pose', () => {
    for (const ex of EXERCISES) {
      const lm = generatePose(ex, { cyclePos: 0.3 });
      expect(lm).toHaveLength(33);
      const visible = lm.filter((l) => l.v > 0.3);
      expect(visible.length).toBeGreaterThan(20);
      for (const l of visible) {
        expect(l.x).toBeGreaterThan(-0.2);
        expect(l.x).toBeLessThan(1.2);
        expect(l.y).toBeGreaterThan(-0.2);
        expect(l.y).toBeLessThan(1.2);
      }
    }
  });
});
