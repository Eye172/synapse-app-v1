import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';

import type {
  PoseVisionStatusEvent,
  PoseVisionViewComponent,
  PoseVisionViewProps,
  PoseVisionViewRef,
} from './types';

/**
 * The pose-vision camera, in a browser.
 *
 * The Android module owns the phone's camera and runs MediaPipe in Kotlin.
 * This is the same view for the web build of the app: the laptop's webcam
 * and MediaPipe's own web runtime, emitting exactly the events the native
 * view does. Everything above it — the bridge, `CameraPoseSource`, the
 * tracker, the engine, the live screen and the 3D overlay — is the app's
 * code, unchanged, so what the laptop shows is what the phone would.
 *
 * Differences from the phone, both deliberate:
 *  - no recording (`canRecord: false`) — clips are a phone feature;
 *  - the runtime and the model load from a CDN rather than the APK.
 *
 * Run it with `npx expo start --web` and a set in developer mode (always on
 * in a development build): Arm → grant the camera → Begin positioning.
 */

export * from './types';

const MEDIAPIPE_VERSION = '1.0.1';
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
/** The same full-size pose model the Android build ships. */
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';

/** The phone's detector runs at about 15 Hz; so does this, so the two behave alike. */
const DETECT_PERIOD_MS = 66;

type Loaded = { landmarker: PoseLandmarker; delegate: 'GPU' | 'CPU' };
let loading: Promise<Loaded> | null = null;

/**
 * One landmarker for the page, GPU first and CPU if the browser refuses —
 * the same fallback the Android engine makes.
 */
function loadLandmarker(): Promise<Loaded> {
  if (loading) return loading;
  loading = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        const landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        return { landmarker, delegate };
      } catch (e) {
        if (delegate === 'CPU') throw e;
      }
    }
    throw new Error('the pose detector could not be created');
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/**
 * MediaPipe's video mode rejects a timestamp that does not strictly increase,
 * for the life of the landmarker — which outlives any one view. Kept here,
 * not per view, so a remounted camera cannot send the clock backwards.
 */
let lastStamp = 0;

function flatten(points: NormalizedLandmark[]): number[] {
  const out: number[] = [];
  for (const p of points) out.push(p.x, p.y, p.z, p.visibility ?? 0);
  return out;
}

const WebPoseVisionView = forwardRef<PoseVisionViewRef, PoseVisionViewProps>(function WebPoseVisionView(props, ref) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // handlers change every render; the capture loop reads the latest through this
  const propsRef = useRef(props);
  propsRef.current = props;
  const facing = props.facing ?? 'front';

  useImperativeHandle(
    ref,
    () => ({
      startRecording: async () => {
        throw new Error('recording is not available in the browser preview');
      },
      stopRecording: async () => {},
    }),
    [],
  );

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const status: PoseVisionStatusEvent = { camera: 'starting', detector: 'loading', detail: '', canRecord: false };
    const emit = () => propsRef.current.onStatus?.({ nativeEvent: { ...status } });

    const fail = (message: string) => {
      status.camera = 'failed';
      status.detail = message;
      emit();
      propsRef.current.onCameraError?.({ nativeEvent: { message, fatal: true } });
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing === 'back' ? 'environment' : 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        status.camera = 'ready';
        emit();
      } catch (e) {
        if (!stopped) fail(e instanceof Error ? e.message : String(e));
        return;
      }

      let loaded: Loaded;
      try {
        loaded = await loadLandmarker();
      } catch (e) {
        if (stopped) return;
        status.detector = 'unavailable';
        status.detail = e instanceof Error ? e.message : String(e);
        emit();
        return;
      }
      if (stopped) return;
      status.detector = 'ready';
      status.detail = loaded.delegate;
      emit();

      const tick = () => {
        if (stopped) return;
        timer = setTimeout(tick, DETECT_PERIOD_MS);
        if (propsRef.current.detecting === false) return;
        const video = videoRef.current;
        if (!video || video.readyState < 2 || video.videoWidth === 0) return;

        const began = performance.now();
        lastStamp = Math.max(lastStamp + 1, began);
        let result;
        try {
          result = loaded.landmarker.detectForVideo(video, lastStamp);
        } catch {
          return; // a frame the runtime would not take; the next one will do
        }
        const image = result.landmarks?.[0];
        const world = result.worldLandmarks?.[0];
        if (!image || !world) return;
        const latencyMs = performance.now() - began;
        propsRef.current.onPose?.({
          nativeEvent: {
            image: flatten(image),
            world: flatten(world),
            width: video.videoWidth,
            height: video.videoHeight,
            // on the wall clock the tracker samples by, as the phone stamps it
            t: Date.now() - latencyMs,
            latencyMs,
          },
        });
      };
      tick();
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  const size = StyleSheet.flatten(props.style) ?? {};
  // cropped to fill and mirrored from the front camera, exactly as the phone's
  // preview is — the overlay's viewport maths assumes both
  return (
    <video
      ref={videoRef}
      muted
      playsInline
      autoPlay
      style={{
        width: typeof size.width === 'number' ? size.width : '100%',
        height: typeof size.height === 'number' ? size.height : '100%',
        objectFit: 'cover',
        display: 'block',
        transform: facing === 'back' ? undefined : 'scaleX(-1)',
      }}
    />
  );
});

/** The browser has a camera to offer whenever it exposes getUserMedia. */
export function isPoseVisionAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

export function getPoseVisionView(): PoseVisionViewComponent | null {
  return isPoseVisionAvailable() ? (WebPoseVisionView as PoseVisionViewComponent) : null;
}

export default isPoseVisionAvailable() ? { isAvailable: () => true } : null;
