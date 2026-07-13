import { MetricTracker, deriveMetrics } from '@/src/engine/poseMetrics';
import type { SensorFrame } from '@/src/engine/types';
import { Emitter, type SensorSource, type SourceStatus, type Unsubscribe } from '@/src/sources/types';

import { generatePose } from './kinematics';
import type { SimTimeline } from './simTimeline';

/**
 * The simulated Rig: emits SensorFrames shaped exactly like the UDP
 * normalizer's output — a single "spine" node plus the firmware-style alert
 * flag — derived from the same kinematics as the sim pose, so the sim Rig
 * can never contradict the sim body (§2.10).
 */
export class SimSensorSource implements SensorSource {
  readonly kind = 'sim' as const;
  status: SourceStatus = 'idle';

  private timer: ReturnType<typeof setInterval> | null = null;
  private frames = new Emitter<SensorFrame>();
  private statuses = new Emitter<SourceStatus>();
  private tracker = new MetricTracker();

  constructor(
    private timeline: SimTimeline,
    private opts: { hz?: number; now?: () => number } = {},
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
  tickOnce(nowMs?: number): SensorFrame {
    const now = nowMs ?? (this.opts.now ? this.opts.now() : Date.now());
    const p = this.timeline.at(now);
    const landmarks = generatePose(this.timeline.ex, {
      cyclePos: p.cyclePos,
      faults: p.faults,
      wobble: 0,
      noiseT: 0,
    });
    const m = deriveMetrics(landmarks, now, this.tracker);
    const spine = m.spineFlex ?? 88;
    const frame: SensorFrame = {
      t: now,
      nodes: [{ id: 'spine', angleDeg: Math.round(spine * 10) / 10 }],
      // mirror the firmware's rule: angle < 45° ⇒ alert (see materials/base/main.py)
      flags: { alert: spine < 45 },
      battery: 83,
    };
    this.frames.emit(frame);
    return frame;
  }

  onFrame(cb: (f: SensorFrame) => void): Unsubscribe {
    return this.frames.on(cb);
  }
  onStatus(cb: (s: SourceStatus) => void): Unsubscribe {
    return this.statuses.on(cb);
  }
  private setStatus(s: SourceStatus): void {
    this.status = s;
    this.statuses.emit(s);
  }
}
