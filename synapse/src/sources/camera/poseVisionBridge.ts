import { LANDMARK_COUNT } from '@/src/engine/types';
import type { PoseObservation } from '@/src/vision/types';

import { isPoseVisionAvailable, type PoseVisionEvent } from '@/modules/pose-vision';
import { registerPoseDetector, type PoseDetector, type PoseDetectorFactory } from './PoseDetector';

/**
 * The join between the camera view and the detector seam.
 *
 * The seam was written for a detector that owns its own lifecycle — start it,
 * get callbacks, stop it. The real detector cannot work that way: it lives on
 * a camera surface, which React mounts and unmounts, so the frames arrive
 * from a view rather than from anything the source could start. This bridge
 * keeps both halves honest. The view publishes observations as they come; the
 * detector the seam creates simply subscribes to them.
 *
 * Nothing here holds a frame. Only points cross this file, which is the same
 * guarantee the seam was built to make.
 */

type Listener = (observation: PoseObservation) => void;

const listeners = new Set<Listener>();

/** How stale an observation may be before it stops counting as live. */
const FRESH_MS = 1500;

let lastAt = 0;

/** Components per landmark in the native payload: x, y, z, visibility. */
const STRIDE = 4;

function finite(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Turn one native detection into the app's observation.
 *
 * Two conversions happen here and nowhere else. MediaPipe reports image
 * points y-down and world points y-down with z growing away from the lens;
 * this app has y up and z toward the viewer in metric space. Both are
 * therefore flipped exactly once, here — the same single flip the web
 * harness makes, so a phone and the harness agree about which way a body
 * faces.
 *
 * Returns null rather than a half-built observation when the payload is not
 * the shape it claims to be: a detector that has produced nonsense must read
 * as "no pose", never as a pose in the wrong place.
 */
export function observationFromNative(e: PoseVisionEvent): PoseObservation | null {
  const wantedLength = LANDMARK_COUNT * STRIDE;
  if (!Array.isArray(e.image) || !Array.isArray(e.world)) return null;
  if (e.image.length !== wantedLength || e.world.length !== wantedLength) return null;
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
    t: finite(e.t) ? e.t : Date.now(),
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
  lastAt = Date.now();
  for (const listener of listeners) listener(observation);
}

/** True while the camera has produced a pose recently enough to trust. */
export function poseVisionLive(now: number = Date.now()): boolean {
  return lastAt > 0 && now - lastAt < FRESH_MS;
}

/** Forget any history — used when a screen tears its camera down. */
export function resetPoseVision(): void {
  lastAt = 0;
}

class BridgedPoseDetector implements PoseDetector {
  readonly name = 'MediaPipe Pose (CameraX)';
  /** it reports world landmarks in metres, which is what makes the fit possible */
  readonly metric = true;

  private off: (() => void) | null = null;

  async start(onPose: (observation: PoseObservation) => void): Promise<void> {
    this.stopListening();
    const listener: Listener = (observation) => onPose(observation);
    listeners.add(listener);
    this.off = () => listeners.delete(listener);
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
 * nothing, so the camera keeps reporting unavailable exactly as before
 * rather than offering a source that cannot produce a frame.
 */
export function installPoseVision(): void {
  if (!isPoseVisionAvailable()) return;
  registerPoseDetector(poseVisionFactory);
}
