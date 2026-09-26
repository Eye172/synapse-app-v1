import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import type { PoseVisionViewComponent, PoseVisionViewProps, PoseVisionViewRef } from './types';

/**
 * The camera that also measures.
 *
 * `expo-camera` renders a preview and hands its frames to nobody, and Android
 * will not open one camera twice — so on a build that needs landmarks, this
 * view replaces it rather than sitting beside it. It carries the preview, the
 * detector and the recorder off a single camera session.
 *
 * `requireOptionalNativeModule` returns null wherever the native side does not
 * exist — the web preview and Expo Go — so callers report the camera as
 * unavailable instead of crashing on import.
 */

export * from './types';

const PoseVisionModule = requireOptionalNativeModule<{ isAvailable(): boolean }>('PoseVision');

/** true only on a build that carries the native camera + detector. */
export function isPoseVisionAvailable(): boolean {
  return PoseVisionModule !== null;
}

/**
 * Resolved lazily: asking for the native view on a build without the native
 * side throws, and the whole point of the check above is to let callers ask
 * first and fall back cleanly.
 */
export function getPoseVisionView(): PoseVisionViewComponent | null {
  if (PoseVisionModule === null) return null;
  return requireNativeViewManager<PoseVisionViewProps & { ref?: React.Ref<PoseVisionViewRef> }>(
    'PoseVision',
  );
}

export default PoseVisionModule;
