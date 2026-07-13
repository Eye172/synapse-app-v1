/**
 * Rep phase machine with hysteresis (§2.7): top→bottom→top = 1 rep,
 * exercises that start flexed (deadlift, press) count on reaching the top.
 * Null metric values freeze the machine — no data, no phantom reps.
 */
import type { RepSpec, TempoSpec } from './types';

export type RepPhase = 'seeking' | 'top' | 'descending' | 'bottom' | 'ascending';

export interface RepTiming {
  /** ms between the crossing zones — rough phase estimates for the ticker */
  eccMs: number;
  /** ms held in the bottom zone */
  pauseMs: number;
  /** ms moving back to the top */
  conMs: number;
  /** full rep period, top-entry to top-entry; null for the first rep */
  periodMs: number | null;
}

export interface RepTick {
  phase: RepPhase;
  count: number;
  /** set when this update completed a rep */
  completed: { index: number; timing: RepTiming } | null;
}

export class RepCounter {
  private phase: RepPhase = 'seeking';
  private _count = 0;
  private bottomVisited = false;
  private leftTopAt = 0;
  private enteredBottomAt = 0;
  private leftBottomAt = 0;
  private lastRepAt: number | null = null;

  constructor(private spec: RepSpec) {}

  get count(): number {
    return this._count;
  }
  get currentPhase(): RepPhase {
    return this.phase;
  }

  private inTop(v: number): boolean {
    return v >= this.spec.topAngle - this.spec.hysteresis;
  }
  private inBottom(v: number): boolean {
    return v <= this.spec.bottomAngle + this.spec.hysteresis;
  }

  update(value: number | null, t: number): RepTick {
    if (value === null) return { phase: this.phase, count: this._count, completed: null };
    let completed: RepTick['completed'] = null;

    switch (this.phase) {
      case 'seeking':
        if (this.inTop(value)) {
          this.phase = 'top';
        } else if (this.inBottom(value)) {
          this.phase = 'bottom';
          this.bottomVisited = true;
          this.enteredBottomAt = t;
          this.leftTopAt = t;
        }
        break;

      case 'top':
        if (!this.inTop(value)) {
          this.phase = 'descending';
          this.leftTopAt = t;
        }
        break;

      case 'descending':
        if (this.inBottom(value)) {
          this.phase = 'bottom';
          this.bottomVisited = true;
          this.enteredBottomAt = t;
        } else if (this.inTop(value)) {
          // partial dip — went back up without reaching the bottom
          this.phase = 'top';
        }
        break;

      case 'bottom':
        if (!this.inBottom(value)) {
          this.phase = 'ascending';
          this.leftBottomAt = t;
        }
        break;

      case 'ascending':
        if (this.inTop(value)) {
          this.phase = 'top';
          if (this.bottomVisited) {
            this._count += 1;
            completed = {
              index: this._count,
              timing: {
                eccMs: Math.max(0, this.enteredBottomAt - this.leftTopAt),
                pauseMs: Math.max(0, this.leftBottomAt - this.enteredBottomAt),
                conMs: Math.max(0, t - this.leftBottomAt),
                periodMs: this.lastRepAt === null ? null : t - this.lastRepAt,
              },
            };
            this.lastRepAt = t;
            this.bottomVisited = false;
          }
        } else if (this.inBottom(value)) {
          this.phase = 'bottom';
          this.enteredBottomAt = t;
        }
        break;
    }

    return { phase: this.phase, count: this._count, completed };
  }

  reset(): void {
    this.phase = 'seeking';
    this._count = 0;
    this.bottomVisited = false;
    this.lastRepAt = null;
  }
}

/**
 * 0..100 — rep-period pacing against the target tempo. Zone-crossing phase
 * estimates are systematically short (the metric dwells inside the
 * hysteresis zones), so adherence is judged on the robustly measurable
 * whole-rep period instead. Null until a second rep exists.
 */
export function tempoAdherence(timing: RepTiming, tempo: TempoSpec | undefined): number | null {
  if (!tempo || timing.periodMs === null) return null;
  const target = (tempo.ecc + tempo.pause + tempo.con) * 1000;
  if (target <= 0) return null;
  const dev = Math.min(1, Math.abs(timing.periodMs - target) / target);
  return Math.round(100 * (1 - dev));
}
