import type { ExerciseSpec } from '@/src/engine/types';

import type { FaultLevels } from './kinematics';

/**
 * One timeline drives both simulator sources, so the sim Rig and the sim
 * camera can never disagree about where the body is.
 */

export type FaultKind = keyof FaultLevels;

export interface FaultScript {
  kind: FaultKind | 'none';
  /** 1-based rep numbers that carry the fault */
  reps: number[];
  /** 0..1 */
  intensity: number;
}

/** The fault a test injects when none is specified. */
export function defaultFaultScript(ex: ExerciseSpec): FaultScript {
  const kind: FaultKind =
    ex.id === 'back_squat' ? 'kneeValgus'
    : ex.id === 'overhead_press' ? 'barDrift'
    : ex.id === 'bench_press' ? 'elbowFlare'
    : ex.id === 'barbell_row' ? 'heave'
    : 'spineRound'; // deadlift, rdl — the flagship
  return { kind, reps: [3], intensity: 1 };
}

export interface TimelinePoint {
  /** 0..1 through the current rep */
  cyclePos: number;
  /** 1-based rep currently in progress */
  repIndex: number;
  faults: FaultLevels;
  phase: 'out' | 'hold' | 'back' | 'rest';
}

interface Phase {
  name: TimelinePoint['phase'];
  dur: number;
  from: number;
  to: number;
}

export class SimTimeline {
  private phases: Phase[];
  private repDur: number;
  readonly ex: ExerciseSpec;
  private fault: FaultScript;
  t0: number;

  constructor(ex: ExerciseSpec, opts: { t0: number; fault?: FaultScript }) {
    this.ex = ex;
    this.t0 = opts.t0;
    this.fault = opts.fault ?? { kind: 'none', reps: [], intensity: 0 };
    const tempo = ex.tempo ?? { ecc: 2, pause: 1, con: 1 };
    // "out" = away from the start position, "back" = returning to it
    const outSec = ex.rep.startsAt === 'top' ? tempo.ecc : tempo.con;
    const backSec = ex.rep.startsAt === 'top' ? tempo.con : tempo.ecc;
    this.phases = [
      { name: 'out', dur: outSec * 1000, from: 0, to: 0.5 },
      { name: 'hold', dur: Math.max(0.35, tempo.pause) * 1000, from: 0.5, to: 0.5 },
      { name: 'back', dur: backSec * 1000, from: 0.5, to: 1 },
      { name: 'rest', dur: 750, from: 1, to: 1 },
    ];
    this.repDur = this.phases.reduce((a, p) => a + p.dur, 0);
  }

  setFault(f: FaultScript): void {
    this.fault = f;
  }
  getFault(): FaultScript {
    return this.fault;
  }
  /** restart the cycle so the set begins at rep zero */
  rebase(t0: number): void {
    this.t0 = t0;
  }

  at(tMs: number): TimelinePoint {
    const el = Math.max(0, tMs - this.t0);
    const repIndex = Math.floor(el / this.repDur) + 1;
    let inRep = el % this.repDur;
    let phase: Phase = this.phases[this.phases.length - 1]!;
    for (const p of this.phases) {
      if (inRep < p.dur) {
        phase = p;
        break;
      }
      inRep -= p.dur;
    }
    const k = phase.dur > 0 ? inRep / phase.dur : 1;
    // linear within the phase — the kinematics' cosine movement curve
    // already supplies the human velocity profile; easing twice would
    // compress the mid-range and wreck the measured tempo
    const eased = phase.from === phase.to ? phase.from : phase.from + (phase.to - phase.from) * k;

    const faults: FaultLevels = {};
    if (this.fault.kind !== 'none' && this.fault.reps.includes(repIndex)) {
      // Ramp the fault in and out inside the rep so it reads organically.
      // Bottom-start lifts (deadlift/press) count the rep at the top of the
      // cycle — the fault must live in the pre-count half so it is
      // attributed to the rep the script names.
      const repPos = (el % this.repDur) / this.repDur;
      // Bottom-start lifts: the fault lives just off the floor (early pull),
      // which is where backs physically round — and it must be fully over
      // before the counter can register the rep at top-zone entry
      // (≈ repPos 0.16), or the tail would be attributed to the next rep.
      const window =
        this.ex.rep.startsAt === 'bottom'
          ? repPos < 0.15
            ? Math.sin(Math.PI * (repPos / 0.15))
            : 0
          : Math.sin(Math.PI * Math.min(1, Math.max(0, repPos)));
      if (window > 0) faults[this.fault.kind] = this.fault.intensity * (0.35 + 0.65 * window);
    }

    return { cyclePos: eased % 1, repIndex, faults, phase: phase.name };
  }
}

