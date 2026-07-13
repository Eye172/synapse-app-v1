import { EXERCISES } from '@/src/data/exercises';

import { AlertTracker, RepScopeTracker, gradeFrame, rangeSeverity } from './ruleEngine';
import { EMPTY_METRICS, type JointMetrics } from './types';

const SQUAT = EXERCISES.find((e) => e.id === 'back_squat')!;

function metrics(p: Partial<Omit<JointMetrics, 't'>>): Omit<JointMetrics, 't'> {
  return { ...EMPTY_METRICS, ...p };
}

describe('rangeSeverity — continuous ok→warn→error', () => {
  const ok: [number, number] = [0, 8];
  const warn: [number, number] = [0, 15];

  it('is 0 inside ok', () => {
    expect(rangeSeverity(0, ok, warn)).toBe(0);
    expect(rangeSeverity(8, ok, warn)).toBe(0);
  });
  it('lerps through the warn band', () => {
    expect(rangeSeverity(11.5, ok, warn)).toBeCloseTo(0.5, 5);
    expect(rangeSeverity(9, ok, warn)).toBeGreaterThan(0);
    expect(rangeSeverity(9, ok, warn)).toBeLessThan(0.3);
  });
  it('is 1 at and beyond the warn edge', () => {
    expect(rangeSeverity(15, ok, warn)).toBe(1);
    expect(rangeSeverity(40, ok, warn)).toBe(1);
  });
  it('handles two-sided bands', () => {
    const ok2: [number, number] = [45, 95];
    const warn2: [number, number] = [38, 95];
    expect(rangeSeverity(70, ok2, warn2)).toBe(0);
    expect(rangeSeverity(41.5, ok2, warn2)).toBeCloseTo(0.5, 5);
    expect(rangeSeverity(30, ok2, warn2)).toBe(1);
  });
});

describe('gradeFrame', () => {
  it('tints the rule segments by severity and picks the priority-weighted worst', () => {
    const alerts = new AlertTracker();
    const g = gradeFrame(
      SQUAT,
      0,
      metrics({ torsoLean: 20, kneeValgus: 20, symmetry: 96, kneeAngle: 120, hipAngle: 120, hipBelowKnee: false }),
      alerts,
    );
    expect(g.segments.leftThigh).toBe(1); // valgus error
    expect(g.segments.torso ?? 0).toBe(0); // spine fine
    expect(g.worstLive!.rule.id).toBe('knee_tracking');
  });

  it('reports NO DATA (null severity) instead of guessing', () => {
    const alerts = new AlertTracker();
    const g = gradeFrame(SQUAT, 0, metrics({ torsoLean: 20 }), alerts);
    const valgus = g.evals.find((e) => e.rule.id === 'knee_tracking')!;
    expect(valgus.severity).toBeNull();
    expect(g.segments.leftThigh).toBeUndefined();
  });

  it('raises a safety alert only after the error is sustained', () => {
    const alerts = new AlertTracker(250, 900);
    const bad = metrics({ torsoLean: 70, kneeValgus: 2, symmetry: 96 });
    expect(gradeFrame(SQUAT, 0, bad, alerts).alert).toBeNull();
    expect(gradeFrame(SQUAT, 100, bad, alerts).alert).toBeNull();
    const raised = gradeFrame(SQUAT, 300, bad, alerts).alert;
    expect(raised).not.toBeNull();
    expect(raised!.risk).toBe('spine');
    // clears only after sustained clean
    const good = metrics({ torsoLean: 20, kneeValgus: 2, symmetry: 96 });
    expect(gradeFrame(SQUAT, 400, good, alerts).alert).not.toBeNull();
    expect(gradeFrame(SQUAT, 1400, good, alerts).alert).toBeNull();
  });

  it('a Rig alert flag forces the alert and paints the torso red', () => {
    const alerts = new AlertTracker();
    const g = gradeFrame(SQUAT, 0, metrics({ torsoLean: 10 }), alerts, true);
    expect(g.alert).not.toBeNull();
    expect(g.alert!.fromRig).toBe(true);
    expect(g.segments.torso).toBe(1);
  });
});

describe('RepScopeTracker', () => {
  it('judges depth from whether the rep ever hit it', () => {
    const t = new RepScopeTracker();
    t.observe(metrics({ hipBelowKnee: false }));
    t.observe(metrics({ hipBelowKnee: true }));
    t.observe(metrics({ hipBelowKnee: false }));
    const evals = t.judge(SQUAT);
    const depth = evals.find((e) => e.rule.id === 'depth')!;
    expect(depth.severity).toBe(0);
  });

  it('fails the rep that never reached depth and resets after judging', () => {
    const t = new RepScopeTracker();
    t.observe(metrics({ hipBelowKnee: false }));
    const evals = t.judge(SQUAT);
    expect(evals.find((e) => e.rule.id === 'depth')!.severity).toBe(1);
    // next rep starts clean
    t.observe(metrics({ hipBelowKnee: true }));
    expect(t.judge(SQUAT).find((e) => e.rule.id === 'depth')!.severity).toBe(0);
  });

  it('judges range rep-rules on the rep extreme (rdl hinge depth)', () => {
    const rdl = EXERCISES.find((e) => e.id === 'rdl')!;
    const t = new RepScopeTracker();
    t.observe(metrics({ hipAngle: 170 }));
    t.observe(metrics({ hipAngle: 100 })); // deep enough (ok band [80,110])
    t.observe(metrics({ hipAngle: 170 }));
    const deep = t.judge(rdl).find((e) => e.rule.id === 'hinge_depth')!;
    expect(deep.severity).toBe(0);

    t.observe(metrics({ hipAngle: 170 }));
    t.observe(metrics({ hipAngle: 140 })); // shallow — outside warn [70,125]
    const shallow = t.judge(rdl).find((e) => e.rule.id === 'hinge_depth')!;
    expect(shallow.severity).toBe(1);
  });
});
