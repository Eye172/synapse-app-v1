import { LANDMARK_COUNT } from '@/src/engine/types';
import type { PoseObservation } from '@/src/vision/types';

import { isPoseVisionAvailable, type PoseVisionEvent } from '@/modules/pose-vision';
import { registerPoseDetector, type PoseDetector, type PoseDetectorFactory } from './PoseDetector';

/**
 * The join between the camera view and the detector seam.
 *
 * The seam was written for a detector that owns its own lifecycle — start it,
 * get callbacks, stop it. The real detector cannot work that way: it lives on
 * a camera surface, which React mounts and unmounts, so frames arrive from a
 * view rather than from anything a source could start. This bridge keeps both
 * halves honest. The view publishes what it sees; the detector the seam
 * creates subscribes to it.
 *
 * Nothing here holds a frame. Only points cross this file, which is the same
 * guarantee the seam was built to make.
 */

type PoseListener = (observation: PoseObservation) => void;
type FailureListener = (reason: string) => void;

const poseListeners = new Set<PoseListener>();
const failureListeners = new Set<FailureListener>();

/** Components per landmark in the native payload: x, y, z, visibility. */
const STRIDE = 4;

/**
 * How far a frame's clock may disagree with this one before it is not
 * believed. Detection latency is tens of milliseconds; a gap of seconds means
 * the stamp came from a different clock altogether.
 */
export const MAX_CLOCK_SKEW_MS = 5000;

/** Why the detector cannot run, once the camera has said so; null while it can. */
let detectorFailure: string | null = null;

function finite(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * The moment a frame was taken, on the clock the rest of the app samples by.
 *
 * The tracker is updated with each observation's `t` and sampled with
 * `Date.now()`. If the two come from different clocks — a camera sensor
 * counting from boot against a wall clock counting from 1970 — every joint
 * reads as hours old, the tracker drops all of them, and the figure never
 * appears. Nothing errors; the overlay is simply never drawn. So a stamp that
 * cannot be on this clock is replaced with the best estimate this side has:
 * now, less however long the detector said it took.
 */
export function frameTime(e: Pick<PoseVisionEvent, 't' | 'latencyMs'>, now: number): number {
  if (finite(e.t) && Math.abs(now - e.t) <= MAX_CLOCK_SKEW_MS) return e.t;
  const latency = finite(e.latencyMs) && e.latencyMs >= 0 ? Math.min(e.latencyMs, MAX_CLOCK_SKEW_MS) : 0;
  return now - latency;
}

/**
 * Turn one native detection into the app's observation.
 *
 * MediaPipe reports image points y-down and world points y-down with z
 * growing away from the lens; this app has y up and z toward the viewer in
 * metric space. Both are flipped exactly once, here — the same single flip
 * the web harness makes, so a phone and the harness agree about which way a
 * body faces. A sign error here does not crash; it quietly builds a body
 * facing backwards.
 *
 * Returns null rather than a half-built observation when the payload is not
 * the shape it claims: a detector that produced nonsense must read as "no
 * pose", never as a pose in the wrong place.
 */
export function observationFromNative(e: PoseVisionEvent, now: number = Date.now()): PoseObservation | null {
  const wanted = LANDMARK_COUNT * STRIDE;
  if (!Array.isArray(e.image) || !Array.isArray(e.world)) return null;
  if (e.image.length !== wanted || e.world.length !== wanted) return null;
  if (!finite(e.width) || !finite(e.height) || e.width <= 0 || e.height <= 0) return null;

  const image: PoseObservation['image'] = [];
  const world: NonNullable<PoseObservation['world']> = [];

  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const o = i * STRIDE;
    const ix = e.image[o];
    const iy = e.image[o + 1];
    const iz = e.image[o + 2];
    const iv = e.image[o + 3];
    const wx = e.world[o];
    const wy = e.world[o + 1];
    const wz = e.world[o + 2];
    const wv = e.world[o + 3];
    if (!finite(ix) || !finite(iy) || !finite(iz) || !finite(iv)) return null;
    if (!finite(wx) || !finite(wy) || !finite(wz) || !finite(wv)) return null;

    image.push({ x: ix, y: iy, z: -iz, v: iv });
    world.push({ x: wx, y: -wy, z: -wz, v: wv });
  }

  return {
    t: frameTime(e, now),
    image,
    world,
    frame: { width: Math.round(e.width), height: Math.round(e.height) },
  };
}

/**
 * Called by the camera view for every detection. Anything that fails to
 * convert is dropped here rather than being passed on half-formed.
 */
export function publishNativePose(e: PoseVisionEvent): void {
  const observation = observationFromNative(e);
  if (observation === null) return;
  for (const listener of poseListeners) listener(observation);
}

/**
 * Called by the camera view whenever its detector changes state. A detector
 * that cannot run is announced to every source listening, once; one that
 * recovers (a remount that found the model this time) clears it.
 */
export function publishDetectorState(state: 'loading' | 'ready' | 'unavailable', detail: string): void {
  if (state !== 'unavailable') {
    detectorFailure = null;
    return;
  }
  const reason = detail || 'the pose detector is unavailable on this phone';
  if (detectorFailure === reason) return;
  detectorFailure = reason;
  for (const listener of failureListeners) listener(reason);
}

/**
 * Forget a failure a previous camera reported. The app never needs to call
 * this: a camera's first status as it comes up is `loading` or `ready`, and
 * either clears it. It exists so tests can start from a clean slate.
 */
export function resetPoseVision(): void {
  detectorFailure = null;
}

class BridgedPoseDetector implements PoseDetector {
  readonly name = 'MediaPipe Pose (CameraX)';
  /** it reports world landmarks in metres, which is what makes the fit possible */
  readonly metric = true;

  private off: (() => void) | null = null;

  async start(onPose: PoseListener, onFailure?: FailureListener): Promise<void> {
    // starting twice must not subscribe twice: every frame would then arrive
    // at the source twice, and the tracker would read each as its own sample
    this.stopListening();
    const pose: PoseListener = (o) => onPose(o);
    const fail: FailureListener = (r) => onFailure?.(r);
    poseListeners.add(pose);
    failureListeners.add(fail);
    this.off = () => {
      poseListeners.delete(pose);
      failureListeners.delete(fail);
    };
    // a detector that had already failed before this source started listening
    // is reported now, rather than never
    if (detectorFailure !== null) fail(detectorFailure);
  }

  async stop(): Promise<void> {
    this.stopListening();
  }

  private stopListening(): void {
    this.off?.();
    this.off = null;
  }
}

export const poseVisionFactory: PoseDetectorFactory = {
  isAvailable: () => isPoseVisionAvailable(),
  create: () => new BridgedPoseDetector(),
};

/**
 * Called once at startup. A build without the native module registers
 * nothing, so the camera keeps reporting unavailable exactly as before rather
 * than offering a source that cannot produce a frame.
 */
export function installPoseVision(): void {
  if (!isPoseVisionAvailable()) return;
  registerPoseDetector(poseVisionFactory);
}

/** Exposed for tests: how many sources are currently listening. */
export function listenerCount(): number {
  return poseListeners.size;
}
