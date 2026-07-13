import type { FrameGrade, SafetyAlert } from '@/src/engine/ruleEngine';
import type { RepRecord, SetSummary } from '@/src/engine/setSession';
import type { ExerciseSpec } from '@/src/engine/types';

/**
 * CoachProvider seam (§2.8). RuleCoach is always on and needs no network.
 * LLMCoach (PASS 5) layers better phrasing on top — same interface, and it
 * may only narrate engine output, never invent it.
 */
export interface CoachCue {
  text: string;
  ruleId: string | null;
  kind: 'correction' | 'safety' | 'rep';
  /** speak via TTS (subject to the user's voice setting) */
  speak: boolean;
  haptic: 'minor' | 'fault' | 'stop' | null;
  at: number;
}

export interface Coach {
  readonly id: string;
  setStart(ex: ExerciseSpec): void;
  /** called every graded frame; must be cheap; returns a cue at most every few seconds */
  liveGrade(grade: FrameGrade, now: number): CoachCue | null;
  repComplete(rep: RepRecord, now: number): CoachCue | null;
  safetyAlert(alert: SafetyAlert, now: number): CoachCue;
  /** end-of-set written summary + the one thing to fix next */
  setSummary(summary: SetSummary): Promise<{ text: string; source: 'rules' | 'llm' }>;
}
