import type { ViewStyle } from 'react-native';

/**
 * The contract of the pose-vision camera view, shared by both
 * implementations: `index.ts` (Android — CameraX + MediaPipe, in Kotlin)
 * and `index.web.tsx` (browser — the webcam + MediaPipe's web runtime).
 * Everything above the module sees only this, so the app runs the same
 * code on a phone and in a laptop browser.
 */

/** One detection, flattened: 33 × (x, y, z, visibility) per space. */
export interface PoseVisionEvent {
  /** normalized to the frame, y down, as the detector reports it */
  image: number[];
  /** metres, origin between the hips, y down, z away from the lens */
  world: number[];
  /** the upright frame the landmarks are normalized against */
  width: number;
  height: number;
  /** the frame's own timestamp, ms */
  t: number;
  /** how long the detector took on this frame, ms */
  latencyMs: number;
}

/**
 * The whole state of the view, re-sent on every change. The camera and the
 * detector come up independently — a preview can run on a phone whose GPU
 * refused the model and whose CPU is still loading it — so they are reported
 * separately rather than folded into one "ready".
 */
export interface PoseVisionStatusEvent {
  camera: 'starting' | 'ready' | 'failed';
  detector: 'loading' | 'ready' | 'unavailable';
  /** the delegate in use when ready ('GPU' | 'CPU'); the reason when unavailable */
  detail: string;
  /**
   * False when this camera could not bind a recorder alongside the preview
   * and the detector. Detection is kept and recording given up, so a set is
   * never lost to an optional clip.
   */
  canRecord: boolean;
}

export interface PoseVisionErrorEvent {
  message: string;
  /** false for a problem that did not stop the camera (a failed frame, a failed clip) */
  fatal?: boolean;
}

export interface PoseVisionRecordingEvent {
  /** the path the caller asked for, now complete on disk */
  path: string;
  /** false when the muxer reported an error; the file may be unusable */
  ok: boolean;
}

export interface PoseVisionViewProps {
  style?: ViewStyle;
  facing?: 'front' | 'back';
  /** false pauses detection without tearing the camera down */
  detecting?: boolean;
  onPose?: (e: { nativeEvent: PoseVisionEvent }) => void;
  onStatus?: (e: { nativeEvent: PoseVisionStatusEvent }) => void;
  onCameraError?: (e: { nativeEvent: PoseVisionErrorEvent }) => void;
  /**
   * Fires when the recording is finalized on disk — not when it is stopped.
   * A clip attached any earlier is truncated.
   */
  onRecordingFinished?: (e: { nativeEvent: PoseVisionRecordingEvent }) => void;
}

export interface PoseVisionViewRef {
  /** record to this exact path; the caller owns the file and deletes it */
  startRecording(path: string): Promise<void>;
  stopRecording(): Promise<void>;
}

/** The props the view takes, plus the ref that exposes its recorder. */
export type PoseVisionViewComponent = React.ComponentType<
  PoseVisionViewProps & { ref?: React.Ref<PoseVisionViewRef> }
>;
