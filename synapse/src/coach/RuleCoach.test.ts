import { EXERCISES } from '@/src/data/exercises';
import { AlertTracker, gradeFrame } from '@/src/engine/ruleEngine';
import { EMPTY_METRICS, type JointMetrics } from '@/src/engine/types';

import { RuleCoach, buildRuleSummary } from './RuleCoach';
import type { SetSummary } from '@/src/engine/setSession';

const SQUAT = EXERCISES.find((e) => e.id === 'back_squat')!;

function metrics(p: Partial<Omit<JointMetrics, 't'>>): Omit<JointMetrics, 't'> {
  return { ...EMPTY_METRICS, ...p };
}

function gradeWith(p: Partial<Omit<JointMetrics, 't'>>, t = 0) {
  return gradeFrame(SQUAT, t, metrics(p), new AlertTracker());
}

describe('RuleCoach', () => {
  it('speaks the highest-priority failing rule, ≤8 words', () => {
    const coach = new RuleCoach();
    coach.setStart(SQUAT);
    // both spine and valgus erroring — spine has priority 1.0
    const cue = coach.liveGrade(gradeWith({ torsoLean: 70, kneeValgus: 20, symmetry: 95 }), 1000);
    expect(cue).not.toBeNull();
    expect(cue!.ruleId).toBe('neutral_spine');
    expect(cue!.text.split(/\s+/).length).toBeLessThanOrEqual(8);
    expect(cue!.text).not.toContain('!');
  });

  it('rate-limits to one cue per 4 seconds', () => {
    const coach = new RuleCoach();
    coach.setStart(SQUAT);
    expect(coach.liveGrade(gradeWith({ kneeValgus: 20 }), 0)).not.toBeNull();
    expect(coach.liveGrade(gradeWith({ kneeValgus: 20 }), 2000)).toBeNull();
    expect(coach.liveGrade(gradeWith({ torsoLean: 70 }), 3000)).toBeNull();
    expect(coach.liveGrade(gradeWith({ torsoLean: 70 }), 4200)).not.toBeNull();
  });

  it('does not nag the same rule inside 9s unless it escalates to error', () => {
    const coach = new RuleCoach();
    coach.setStart(SQUAT);
    // warn-level valgus (between ok 8 and warn 15 → severity ~0.64)
    expect(coach.liveGrade(gradeWith({ kneeValgus: 12.5 }), 0)!.haptic).toBe('minor');
    // same rule, still warn — silent even after the 4s gap
    expect(coach.liveGrade(gradeWith({ kneeValgus: 12.5 }), 5000)).toBeNull();
    // escalates to full error → speaks again with the fault haptic
    const esc = coach.liveGrade(gradeWith({ kneeValgus: 22 }), 9500);
    expect(esc).not.toBeNull();
    expect(esc!.haptic).toBe('fault');
  });

  it('safety alerts bypass and say Stop', () => {
    const coach = new RuleCoach();
    coach.setStart(SQUAT);
    const cue = coach.safetyAlert({ ruleId: 'neutral_spine', risk: 'spine', cue: 'Chest up. Stop the round.', at: 0, fromRig: false }, 0);
    expect(cue.text.startsWith('Stop.')).toBe(true);
    expect(cue.haptic).toBe('stop');
  });
});

describe('buildRuleSummary — every clause traceable', () => {
  const base: SetSummary = {
    exerciseId: 'back_squat',
    exerciseName: 'Back Squat',
    startedAt: 0,
    endedAt: 60000,
    durationSec: 60,
    reps: 8,
    cleanReps: 6,
    techniqueScore: 82,
    tempoAdherence: 74,
    symmetryAvg: 96,
    safetyAlerts: 1,
    dataSource: 'sim',
    repRecords: [],
    ruleResults: [
      { ruleId: 'neutral_spine', name: 'Neutral spine', worst: 1, failedReps: [3, 6], noData: false, fixCue: 'Chest up. Stop the round.', risk: 'spine' },
      { ruleId: 'knee_tracking', name: 'Knee tracking', worst: 0.3, failedReps: [], noData: false, fixCue: 'Knees out.', risk: 'knee' },
      { ruleId: 'depth', name: 'Depth', worst: 0, failedReps: [], noData: true, fixCue: 'Hit depth.', risk: null },
    ],
  };

  it('names the failed reps, the counts, and exactly one fix', () => {
    const text = buildRuleSummary(base);
    expect(text).toContain('8 reps, 6 clean.');
    expect(text).toContain('Neutral spine broke on reps 3, 6.');
    expect(text).toContain('Tempo adherence 74%.');
    expect(text).toContain('1 safety stop');
    expect(text).toContain('No data for depth');
    expect(text).toContain('One fix:');
    expect(text).not.toContain('!');
  });

  it('never praises without data', () => {
    const empty = { ...base, reps: 0, cleanReps: 0, ruleResults: [], tempoAdherence: null, symmetryAvg: null, safetyAlerts: 0 };
    const text = buildRuleSummary(empty);
    expect(text).toContain('No completed reps');
    expect(text.toLowerCase()).not.toContain('great');
    expect(text.toLowerCase()).not.toContain('well done');
  });
});
