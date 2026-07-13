import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Session history — METRICS ONLY. No video, no frames, ever (§2.12).
 */
export interface RuleResult {
  ruleId: string;
  name: string;
  /** worst severity seen, 0..1 (1 = error) */
  worst: number;
  /** reps that contained an error on this rule */
  failedReps: number[];
  /** true when the metric had no data this set */
  noData: boolean;
}

export interface SessionRecord {
  id: string;
  /** epoch ms */
  date: number;
  exerciseId: string;
  exerciseName: string;
  reps: number;
  cleanReps: number;
  /** 0..100 */
  techniqueScore: number;
  /** 0..100 or null when not measurable */
  symmetryAvg: number | null;
  /** 0..100 tempo adherence or null */
  tempoAdherence: number | null;
  ruleResults: RuleResult[];
  topFault: { ruleId: string; name: string; failedReps: number } | null;
  safetyAlerts: number;
  durationSec: number;
  /** LLM or rule-coach written summary */
  coachSummary: string | null;
  /** which sources fed the set — honesty label */
  dataSource: 'sim' | 'pose' | 'rig' | 'rig+pose';
}

interface HistoryState {
  sessions: SessionRecord[];
  addSession: (s: SessionRecord) => void;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      sessions: [],
      addSession: (s) => set((st) => ({ sessions: [s, ...st.sessions].slice(0, 500) })),
      clear: () => set({ sessions: [] }),
    }),
    {
      name: 'synapse.history.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/** Streak = consecutive days (ending today or yesterday) with ≥1 session. */
export function computeStreak(sessions: SessionRecord[], now = Date.now()): number {
  if (sessions.length === 0) return 0;
  const days = new Set(sessions.map((s) => Math.floor(s.date / 86400000)));
  const today = Math.floor(now / 86400000);
  let d = days.has(today) ? today : days.has(today - 1) ? today - 1 : -1;
  if (d < 0) return 0;
  let streak = 0;
  while (days.has(d)) {
    streak++;
    d--;
  }
  return streak;
}

/** Mean technique score over the trailing 7 days, or null with no data. */
export function weeklySafetyScore(sessions: SessionRecord[], now = Date.now()): number | null {
  const cutoff = now - 7 * 86400000;
  const recent = sessions.filter((s) => s.date >= cutoff);
  if (recent.length === 0) return null;
  return Math.round(recent.reduce((a, s) => a + s.techniqueScore, 0) / recent.length);
}
