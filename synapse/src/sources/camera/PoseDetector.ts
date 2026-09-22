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
  start(onPose: (observation: PoseObservation) => void): Promise<void>;
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

/** Probe for a usable detector; null means the camera cannot place a body. */
export function loadPoseDetector(): PoseDetector | null {
  if (registered?.isAvailable()) {
    try {
      return registered.create();
    } catch (e) {
      console.warn('[synapse] registered pose detector failed to create', e);
      return null;
    }
  }
  // Known native integration: react-native-vision-camera plus a pose
  // frame-processor plugin. Both are optional deps that only exist in a dev
  // build, and the plugin has to be registered natively — without one there
  // is no honest way to produce landmarks, so report unavailable.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vc = require('react-native-vision-camera');
    if (!vc?.Camera) return null;
    return null;
  } catch {
    return null;
  }
}
