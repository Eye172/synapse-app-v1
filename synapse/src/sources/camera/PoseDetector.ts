import type { Landmark } from '@/src/engine/types';

/**
 * On-device pose detection seam (§2.6, §2.13). The app never talks to a
 * detector directly — only through this contract, which returns landmarks
 * and nothing else: frames cannot leave through this interface by design.
 *
 * The concrete detector is a native capability (ML Kit / MediaPipe via a
 * vision-camera frame processor) that only exists in a dev build. In Expo
 * Go, on the web, or when the module is missing, detection is unavailable
 * and the app runs on the simulator — Demo Mode is the fallback, never a
 * crash (deal-breakers 3, 8).
 */
export interface PoseDetector {
  readonly name: string;
  start(onPose: (landmarks: Landmark[], timestampMs: number) => void): Promise<void>;
  stop(): Promise<void>;
}

export interface PoseDetectorFactory {
  isAvailable(): boolean;
  create(): PoseDetector | null;
}

let registered: PoseDetectorFactory | null = null;

/**
 * A dev build with a real detector registers it at startup:
 *   registerPoseDetector(myMlKitFactory)
 * (see README — "Real camera pose").
 */
export function registerPoseDetector(f: PoseDetectorFactory): void {
  registered = f;
}

/** Probe for a usable detector; null means "run Demo Mode pose". */
export function loadPoseDetector(): PoseDetector | null {
  if (registered?.isAvailable()) {
    try {
      return registered.create();
    } catch (e) {
      console.warn('[synapse] registered pose detector failed to create', e);
      return null;
    }
  }
  // Known native integration: react-native-vision-camera + a pose frame
  // processor. Both are optional deps that only exist in a dev build.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vc = require('react-native-vision-camera');
    if (!vc?.Camera) return null;
    // The vision-camera pipeline additionally needs a pose-landmark frame
    // processor plugin registered on the native side. Without one there is
    // no honest way to produce landmarks, so report unavailable.
    return null;
  } catch {
    return null;
  }
}
