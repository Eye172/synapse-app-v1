import type { PoseFrame } from '@/src/engine/types';
import { Emitter, type PoseSource, type SourceStatus, type Unsubscribe } from '@/src/sources/types';

import { generatePose } from './kinematics';
import type { SimTimeline } from './simTimeline';

/**
 * Scripted 33-landmark body — the Mesh animates with no camera at all (§2.10).
 */
export class SimPoseSource implements PoseSource {
  readonly kind = 'sim' as const;
  status: SourceStatus = 'idle';

  private timer: ReturnType<typeof setInterval> | null = null;
  private poses = new Emitter<PoseFrame>();
  private statuses = new Emitter<SourceStatus>();

  constructor(
    private timeline: SimTimeline,
    private opts: { hz?: number; wobble?: number; now?: () => number } = {},
  ) {}

  start(): void {
    if (this.timer) return;
    const hz = this.opts.hz ?? 30;
    this.setStatus('active');
    this.timer = setInterval(() => this.tickOnce(), Math.round(1000 / hz));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.setStatus('idle');
  }

  /** advance one frame — exposed for deterministic tests */
  tickOnce(nowMs?: number): PoseFrame {
    const now = nowMs ?? (this.opts.now ? this.opts.now() : Date.now());
    const p = this.timeline.at(now);
    const frame: PoseFrame = {
      t: now,
      source: 'sim',
      landmarks: generatePose(this.timeline.ex, {
        cyclePos: p.cyclePos,
        faults: p.faults,
        wobble: this.opts.wobble ?? 0.35,
        noiseT: (now - this.timeline.t0) / 1000,
      }),
    };
    this.poses.emit(frame);
    return frame;
  }

  onPose(cb: (f: PoseFrame) => void): Unsubscribe {
    return this.poses.on(cb);
  }
  onStatus(cb: (s: SourceStatus) => void): Unsubscribe {
    return this.statuses.on(cb);
  }
  private setStatus(s: SourceStatus): void {
    this.status = s;
    this.statuses.emit(s);
  }
}
