/**
 * The One Euro filter — the standard answer to the tradeoff every tracked
 * overlay runs into.
 *
 * A fixed low-pass has to choose: cut hard and the figure stops shaking
 * while standing still but lags visibly through a rep, or cut gently and it
 * keeps up but trembles. One Euro refuses the choice by making the cutoff a
 * function of speed — slow signal, heavy smoothing; fast signal, almost
 * none. That is exactly the right behaviour here, because jitter matters
 * when the lifter is holding a position and latency matters when they are
 * moving.
 *
 * Casiez, Roussel & Vogel (CHI 2012). Kept free of any app types so it can
 * be reasoned about and tested as the piece of signal processing it is.
 */

/**
 * A gap longer than this and the previous sample says nothing about how
 * fast the signal is moving now. Half a second is several detector frames:
 * long enough not to trip on an ordinary stutter, short enough that a
 * lifter cannot get far within it.
 */
const RESEED_MS = 500;

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

/** A first-order low-pass that remembers whether it has ever seen a value. */
class LowPass {
  private y: number | null = null;

  filter(x: number, a: number): number {
    this.y = this.y === null ? x : this.y + a * (x - this.y);
    return this.y;
  }

  get value(): number | null {
    return this.y;
  }

  reset(): void {
    this.y = null;
  }
}

export interface OneEuroConfig {
  /**
   * Cutoff at rest, Hz. Lower is steadier and laggier. The useful range for
   * a body landmark is well under a hertz: a joint that is not moving
   * should not move.
   */
  minCutoff: number;
  /**
   * How much speed opens the filter up. This is the knob that buys back
   * latency during a rep; too high and jitter returns at speed.
   */
  beta: number;
  /** cutoff of the derivative's own filter, Hz — mostly leave at 1 */
  dCutoff: number;
  /**
   * The speed below which extrapolation is not worth doing, in the signal's
   * own units per second.
   *
   * Undoing lag means adding velocity times time, and velocity is estimated
   * from the same noisy samples as everything else. While the signal is
   * genuinely still there is no lag to undo — but the noise still implies a
   * small velocity, and multiplying it up puts *more* shake into the output
   * than came in. So the correction is faded out below a speed the noise
   * can plausibly fake and faded in above it. Set it near the apparent
   * speed that detector jitter alone produces: a few centimetres a second
   * in metric space, a couple of percent of frame height per second in
   * image space.
   */
  vGate: number;
}

export class OneEuroFilter {
  private x = new LowPass();
  private dx = new LowPass();
  private lastRaw: number | null = null;
  private lastT = 0;
  /** last estimated rate of change, in units per second */
  velocity = 0;
  /** cutoff the last sample was filtered at, Hz */
  private cutoff: number;

  constructor(private cfg: OneEuroConfig) {
    this.cutoff = cfg.minCutoff;
  }

  /**
   * How far behind the truth this filter currently sits, in ms.
   *
   * A first-order low-pass trails a moving signal by about one time
   * constant, 1/(2*pi*cutoff). It is small and it is real: at the cutoff a
   * rep opens up to, it is around a frame, which on a joint travelling half
   * a metre a second puts the overlay a couple of centimetres behind the
   * body. Since the cutoff is known, so is the lag, and since the velocity
   * is known, the lag can simply be undone.
   */
  get lagMs(): number {
    return 1000 / (2 * Math.PI * Math.max(this.cutoff, 1e-3));
  }

  /**
   * Feed a sample. `t` is in ms; the first sample passes through untouched
   * because a filter with no history has nothing to blend toward.
   */
  filter(value: number, t: number): number {
    if (this.lastRaw === null) {
      this.lastRaw = value;
      this.lastT = t;
      return this.x.filter(value, 1);
    }

    /**
     * A clock that jumped is not a signal that moved.
     *
     * Time runs backwards more often than it sounds like it should: a video
     * is scrubbed, a camera restarts, the app comes back from the
     * background, frames arrive out of order. Clamping a negative or
     * enormous step to the smallest sane one keeps the arithmetic finite
     * but invents a velocity — the same position divided by a millisecond
     * looks like a joint travelling metres a second, and prediction then
     * throws the figure off the lifter. Measured on a scrubbed clip that
     * was the difference between landing within nine pixels and within
     * thirty.
     *
     * There is no history worth keeping across a jump, so the derivative is
     * dropped and the signal carries on from where it is.
     */
    const step = t - this.lastT;
    if (step <= 0 || step > RESEED_MS) {
      this.dx.reset();
      this.velocity = 0;
      this.cutoff = this.cfg.minCutoff;
      this.lastRaw = value;
      this.lastT = t;
      return this.x.filter(value, 1);
    }

    const dt = step / 1000;
    const rawRate = (value - this.lastRaw) / dt;
    const edx = this.dx.filter(rawRate, alpha(this.cfg.dCutoff, dt));
    this.velocity = edx;
    const cutoff = this.cfg.minCutoff + this.cfg.beta * Math.abs(edx);
    this.cutoff = cutoff;
    const out = this.x.filter(value, alpha(cutoff, dt));
    this.lastRaw = value;
    this.lastT = t;
    return out;
  }

  /** Current estimate without feeding anything, or null before the first sample. */
  get value(): number | null {
    return this.x.value;
  }

  /**
   * Where the signal is at `ms` past the last sample.
   *
   * Two different delays are undone here and it matters that both are. The
   * camera produces frames far more slowly than the screen refreshes, so
   * the newest detection is already old by the time anything is drawn —
   * that is the `ms` the caller passes. On top of it the filter has its own
   * lag, which the caller cannot see and would otherwise leave in, parking
   * the figure permanently behind the lifter during every rep.
   *
   * Extrapolation is only honest over a short horizon, which is the
   * caller's job to bound.
   */
  predict(ms: number): number | null {
    const v = this.x.value;
    if (v === null) return null;
    const speed = Math.abs(this.velocity);
    const g = this.cfg.vGate;
    // shrink toward no correction while the signal is as slow as its noise
    const gain = g > 0 ? (speed * speed) / (speed * speed + g * g) : 1;
    return v + (this.velocity * (ms + this.lagMs) * gain) / 1000;
  }

  reset(): void {
    this.x.reset();
    this.dx.reset();
    this.lastRaw = null;
    this.velocity = 0;
    this.cutoff = this.cfg.minCutoff;
  }
}
