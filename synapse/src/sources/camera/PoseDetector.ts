import type { PoseObservation } from '@/src/vision/types';

/**
 * On-device pose detection seam (§2.6, §2.13). The app never talks to a
 * detector directly — only through this contract, which returns points and
 * nothing else: frames cannot leave through this interface by design.
 *
 * An observation carries both spaces. Where the joints landed in the
 * picture is what the overlay is aligned against; how big the body is in
 * metres is what the mannequin is built from. A detector that can only
 * produce the first passes `world: null`, and the overlay falls back to
 * showing the figure from its own angle rather than pretending to place it
 * on the lifter.
 *
 * The concrete detector is a native capability — MediaPipe Pose or ML Kit
 * behind a vision-camera frame processor — that only exists in a dev build.
 * In Expo Go, on the web, or when the module is missing, detection is
 * unavailable and the app says so: a missing detector is reported, never
 * papered over (deal-breakers 3, 8).
 */
export interface PoseDetector {
  readonly name: string;
  /** true when this detector reports metric world points, not just pixels */
  readonly metric: boolean;
  /**
   * Begin delivering observations. `onFailure` fires if the detector becomes
   * unable to produce any — a model that would not load, a camera that cannot
   * stream frames — so the source can report it instead of searching forever
   * for a body nothing is looking for.
   */
  start(onPose: (observation: PoseObservation) => void, onFailure?: (reason: string) => void): Promise<void>;
  stop(): Promise<void>;
}

export interface PoseDetectorFactory {
  isAvailable(): boolean;
  create(): PoseDetector | null;
}

let registered: PoseDetectorFactory | null = null;

/**
 * A dev build with a real detector registers it at startup:
 *   registerPoseDetector(myMediaPipeFactory)
 * (see README — "Real camera pose").
 */
export function registerPoseDetector(f: PoseDetectorFactory): void {
  registered = f;
}

/**
 * Probe for a usable detector; null means the camera cannot place a body.
 *
 * There is exactly one way to have a detector: register one. The app's own
 * is `modules/pose-vision`, installed at startup by `installPoseVision()`;
 * a build without that native module registers nothing and the camera
 * reports unavailable, which is the honest answer rather than a preview that
 * measures nothing.
 */
export function loadPoseDetector(): PoseDetector | null {
  if (!registered?.isAvailable()) return null;
  try {
    return registered.create();
  } catch (e) {
    console.warn('[synapse] registered pose detector failed to create', e);
    return null;
  }
}
