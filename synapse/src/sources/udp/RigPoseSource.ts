import { rigBodyState, rigLandmarks, type RigCalibration } from '@/src/engine/rigBody';
import type { PoseFrame, SensorFrame } from '@/src/engine/types';
import { Emitter, type PoseSource, type SensorSource, type SourceStatus, type Unsubscribe } from '@/src/sources/types';

/**
 * The exoskeleton drawing its own body (§2.6). Five IMUs place a full
 * skeleton by forward kinematics, so the Mesh has a real body to render with
 * no camera and no pose model — the Rig is the primary instrument, and the
 * camera is only ever a second opinion.
 *
 * Emission is decoupled from packet arrival: the Rig ships ~10 Hz, the Mesh
 * wants ~30, so the newest frame is re-rendered on a steady clock. That keeps
 * the skeleton smooth without inventing motion between samples.
 */
export class RigPoseSource implements PoseSource {
  readonly kind = 'rig' as const;
  status: SourceStatus = 'idle';

  private poses = new Emitter<PoseFrame>();
  private statuses = new Emitter<SourceStatus>();
  private unsubSensor: Unsubscribe | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private latest: SensorFrame | null = null;
  private lastArrivalAt = 0;

  constructor(
    private sensor: SensorSource,
    private cal: RigCalibration,
    private opts: { hz?: number; staleMs?: number; now?: () => number } = {},
  ) {}

  /** Swap in a fresh calibration without restarting the stream. */
  setCalibration(cal: RigCalibration): void {
    this.cal = cal;
  }

  start(): void {
    if (this.timer) return;
    this.setStatus('searching');
    this.unsubSensor = this.sensor.onFrame((f) => {
      // only quaternion frames can place a body; legacy scalar frames cannot
      if (!f.nodes.some((n) => n.quat)) return;
      this.latest = f;
      this.lastArrivalAt = this.now();
    });
    const hz = this.opts.hz ?? 30;
    this.timer = setInterval(() => this.tick(), Math.round(1000 / hz));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unsubSensor?.();
    this.unsubSensor = null;
    this.latest = null;
    this.setStatus('idle');
  }

  /** Render one frame from the newest packet. Exposed for deterministic tests. */
  tick(): PoseFrame | null {
    const now = this.now();
    const stale = this.opts.staleMs ?? 1200;
    if (this.latest === null || now - this.lastArrivalAt > stale) {
      // the Rig went quiet: say so rather than replaying a frozen body
      if (this.status === 'active') this.setStatus('searching');
      return null;
    }
    if (this.status !== 'active') this.setStatus('active');
    const frame: PoseFrame = {
      t: now,
      source: 'rig',
      landmarks: rigLandmarks(rigBodyState(this.latest, this.cal)),
    };
    this.poses.emit(frame);
    return frame;
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  onPose(cb: (f: PoseFrame) => void): Unsubscribe {
    return this.poses.on(cb);
  }
  onStatus(cb: (s: SourceStatus) => void): Unsubscribe {
    return this.statuses.on(cb);
  }
  private setStatus(s: SourceStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.statuses.emit(s);
  }
}
