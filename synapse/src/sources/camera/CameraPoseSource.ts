import type { PoseFrame } from '@/src/engine/types';
import { Emitter, type PoseSource, type SourceStatus, type Unsubscribe } from '@/src/sources/types';

import { loadPoseDetector, type PoseDetector } from './PoseDetector';

/**
 * Real-body pose from the camera, on-device only (§2.6). Frames never leave
 * the detector; this source emits landmarks and nothing else. When no
 * detector or no permission exists it reports `unavailable` and the caller
 * falls back to the simulator — the user always sees a live skeleton.
 */
export class CameraPoseSource implements PoseSource {
  readonly kind = 'camera' as const;
  status: SourceStatus = 'idle';

  private detector: PoseDetector | null = null;
  private poses = new Emitter<PoseFrame>();
  private statuses = new Emitter<SourceStatus>();
  private lastFrameAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(private opts: { hasCameraPermission: boolean }) {}

  static available(): boolean {
    return loadPoseDetector() !== null;
  }

  start(): void {
    if (!this.opts.hasCameraPermission) {
      this.setStatus('unavailable');
      return;
    }
    this.detector = loadPoseDetector();
    if (this.detector === null) {
      this.setStatus('unavailable');
      return;
    }
    this.setStatus('searching');
    this.detector
      .start((obs) => {
        this.lastFrameAt = Date.now();
        if (this.status !== 'active') this.setStatus('active');
        // both spaces travel together: the image points say where the body
        // is on screen, the world points say how big it is, and the overlay
        // needs both to land a mannequin on a person
        this.poses.emit({
          t: obs.t || Date.now(),
          source: 'camera',
          landmarks: obs.image,
          world: obs.world ?? undefined,
          frame: obs.frame,
        });
      })
      .catch((e) => {
        console.warn('[synapse] pose detector failed to start', e);
        this.setStatus('unavailable');
      });
    // body lost / detector stalled → searching (auto-recovers on next frame)
    this.watchdog = setInterval(() => {
      if (this.status === 'active' && Date.now() - this.lastFrameAt > 1200) {
        this.setStatus('searching');
      }
    }, 600);
  }

  stop(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    const d = this.detector;
    this.detector = null;
    if (d) {
      d.stop().catch(() => {});
    }
    this.setStatus('idle');
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
