import { computeStreak, type SessionRecord } from '@/src/store/historyStore';

/**
 * Achievements (§2.4-E) — every one derived live from logged metrics, never
 * stored, never invented (deal-breaker 2). Locked ones show progress.
 */
export interface Achievement {
  id: string;
  name: string;
  desc: string;
  earned: boolean;
  /** 0..1 toward earning */
  progress: number;
}

export function computeAchievements(sessions: SessionRecord[]): Achievement[] {
  const totalReps = sessions.reduce((a, s) => a + s.reps, 0);
  const cleanReps = sessions.reduce((a, s) => a + s.cleanReps, 0);
  const streak = computeStreak(sessions);
  const perfectSets = sessions.filter((s) => s.reps >= 3 && s.cleanReps === s.reps).length;
  const distinctLifts = new Set(sessions.map((s) => s.exerciseId)).size;
  const noStopSessions = sessions.filter((s) => s.safetyAlerts === 0).length;
  const scores90 = sessions.filter((s) => s.techniqueScore >= 90).length;

  const mk = (id: string, name: string, desc: string, have: number, need: number): Achievement => ({
    id,
    name,
    desc,
    earned: have >= need,
    progress: Math.max(0, Math.min(1, have / need)),
  });

  return [
    mk('first_set', 'First contact', 'Finish one supervised set', sessions.length, 1),
    mk('clean_50', 'Fifty clean', '50 clean reps logged', cleanReps, 50),
    mk('reps_200', 'Volume node', '200 supervised reps', totalReps, 200),
    mk('streak_3', 'Three-day link', 'Train 3 days in a row', streak, 3),
    mk('streak_7', 'Unbroken week', 'Train 7 days in a row', streak, 7),
    mk('perfect_5', 'Zero-fault five', '5 sets with every rep clean', perfectSets, 5),
    mk('all_lifts', 'Full library', 'Train all 6 lifts', distinctLifts, 6),
    mk('score_90x5', 'Precision band', '5 sets scored 90+', scores90, 5),
    mk('safe_10', 'No red flags', '10 sessions without a safety stop', noStopSessions, 10),
  ];
}
