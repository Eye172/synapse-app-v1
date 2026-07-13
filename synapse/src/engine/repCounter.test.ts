import { RepCounter, tempoAdherence } from './repCounter';
import type { RepSpec } from './types';

const SQUAT: RepSpec = { metric: 'kneeAngle', topAngle: 165, bottomAngle: 95, hysteresis: 8, startsAt: 'top' };
const DEADLIFT: RepSpec = { metric: 'hipAngle', topAngle: 170, bottomAngle: 75, hysteresis: 8, startsAt: 'bottom' };

function run(counter: RepCounter, values: (number | null)[], stepMs = 100): number {
  let t = 0;
  let reps = 0;
  for (const v of values) {
    const tick = counter.update(v, t);
    if (tick.completed) reps = tick.completed.index;
    t += stepMs;
  }
  return reps;
}

describe('RepCounter', () => {
  it('counts top→bottom→top as one rep', () => {
    const c = new RepCounter(SQUAT);
    expect(run(c, [172, 150, 120, 96, 90, 92, 120, 150, 168])).toBe(1);
    expect(c.currentPhase).toBe('top');
  });

  it('does not count a partial dip that misses the bottom', () => {
    const c = new RepCounter(SQUAT);
    expect(run(c, [172, 150, 130, 150, 172])).toBe(0);
  });

  it('hysteresis jitter at the top boundary cannot double count', () => {
    const c = new RepCounter(SQUAT);
    // one real rep, then jitter around 165 (within top zone from 157)
    expect(run(c, [172, 120, 90, 130, 166, 160, 166, 159, 165])).toBe(1);
  });

  it('null data freezes the machine instead of inventing reps', () => {
    const c = new RepCounter(SQUAT);
    expect(run(c, [172, 120, null, null, 90, null, 130, 170])).toBe(1);
    run(c, [null, null, null]);
    expect(c.count).toBe(1);
  });

  it('bottom-start lifts count on reaching lockout', () => {
    const c = new RepCounter(DEADLIFT);
    // start at the floor (bottom), pull to lockout → 1 rep at the top
    expect(run(c, [76, 80, 100, 140, 165])).toBe(1);
    // lower and pull again → second rep
    expect(run(c, [140, 100, 78, 100, 150, 168])).toBe(2);
  });

  it('reports phase timings for tempo', () => {
    const c = new RepCounter(SQUAT);
    let completed: { eccMs: number; pauseMs: number; conMs: number; periodMs: number | null } | null = null;
    // leaves the top zone at t=1000, enters bottom at 3000, leaves bottom at 4500, tops out at 5000
    const seq: [number, number][] = [
      [172, 0], [150, 1000], [96, 3000], [95, 3500], [96, 4000], [130, 4500], [166, 5000],
    ];
    for (const [v, t] of seq) {
      const tick = c.update(v, t);
      if (tick.completed) completed = tick.completed.timing;
    }
    expect(completed).not.toBeNull();
    expect(completed!.eccMs).toBe(2000);
    expect(completed!.pauseMs).toBe(1500);
    expect(completed!.conMs).toBe(500);
    expect(completed!.periodMs).toBeNull(); // first rep has no period yet
  });

  it('measures the rep period from the second rep on', () => {
    const c = new RepCounter(SQUAT);
    let last: { periodMs: number | null } | null = null;
    const seq: [number, number][] = [
      [172, 0], [130, 1000], [90, 2000], [130, 3000], [170, 4000], // rep 1 at t=4000
      [130, 5500], [90, 6500], [130, 8000], [170, 9500], // rep 2 at t=9500
    ];
    for (const [v, t] of seq) {
      const tick = c.update(v, t);
      if (tick.completed) last = tick.completed.timing;
    }
    expect(c.count).toBe(2);
    expect(last!.periodMs).toBe(5500);
  });
});

describe('tempoAdherence — whole-rep pacing', () => {
  const tempo = { ecc: 3, pause: 1, con: 1 }; // target period 5s

  it('is 100 on target pace and degrades with deviation', () => {
    expect(tempoAdherence({ eccMs: 0, pauseMs: 0, conMs: 0, periodMs: 5000 }, tempo)).toBe(100);
    expect(tempoAdherence({ eccMs: 0, pauseMs: 0, conMs: 0, periodMs: 2500 }, tempo)).toBe(50);
    expect(tempoAdherence({ eccMs: 0, pauseMs: 0, conMs: 0, periodMs: 12000 }, tempo)).toBe(0);
  });

  it('returns null for the first rep or with no tempo target', () => {
    expect(tempoAdherence({ eccMs: 1, pauseMs: 1, conMs: 1, periodMs: null }, tempo)).toBeNull();
    expect(tempoAdherence({ eccMs: 1, pauseMs: 1, conMs: 1, periodMs: 5000 }, undefined)).toBeNull();
  });
});
