import { CameraView } from 'expo-camera';
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { View } from 'react-native';

import { getPoseVisionView, type PoseVisionViewRef } from '@/modules/pose-vision';
import { publishDetectorState, publishNativePose } from '@/src/sources/camera/poseVisionBridge';
import { useSettingsStore } from '@/src/store/settingsStore';
import { color } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';

import type { CameraTelemetry, TelemetryLine } from './cameraTelemetry';
import { ClipRecorder } from './clipRecorder';
import { discardClipFile, nextClipTarget } from './recording';

/**
 * The one camera a set runs on, from position-lock to the last rep.
 *
 * It sits above the stages rather than inside one, for two reasons that are
 * both about the camera path actually working. Position-lock needs frames to
 * align a body — and while the camera lived inside the live screen, the lock
 * screen listened for poses that nothing was producing, so a camera-only set
 * could never begin. And a camera that closes as position-lock ends and
 * reopens as the set starts costs a second of black screen and throws away
 * the body the tracker had just measured.
 *
 * On a build with the native module this is `PoseVisionView`: preview,
 * detector and recorder off one session. On any other build it is the plain
 * `expo-camera` preview — the wearer still sees themselves and the Rig path
 * is untouched, but nothing is measured from the picture.
 */

export interface SetCameraState {
  /** the preview is up */
  ready: boolean;
  /** this camera can record alongside what else it is running */
  canRecord: boolean;
  /** frames are being measured, not just shown */
  measures: boolean;
}

export interface SetCameraHandle {
  /** Start a clip. Resolves false, never throws, when none was started. */
  startRecording(maxDurationSec: number): Promise<boolean>;
  /** Stop and wait for the clip to be complete: its uri, or null. */
  stopRecording(): Promise<string | null>;
}

export interface SetCameraProps {
  width: number;
  height: number;
  /** run the detector; false shows the picture without measuring it */
  detecting: boolean;
  /** darken the picture so graded segments stay readable over any gym */
  dim?: boolean;
  onState?: (state: SetCameraState) => void;
  /** the camera cannot be used at all; the caller falls back to the void */
  onFailed?: (reason: string) => void;
  /** once a second: what the camera and detector are doing, for the screen */
  onTelemetry?: (t: CameraTelemetry) => void;
}

/** How long a clip may take to finalize before it is given up on. */
const FINALIZE_TIMEOUT_MS = 4000;

export const SetCamera = forwardRef<SetCameraHandle, SetCameraProps>(function SetCamera(
  { width, height, detecting, dim = true, onState, onFailed, onTelemetry },
  ref,
) {
  const facing = useSettingsStore((s) => s.cameraFacing);
  // resolved once: asking for the native view on a build without it throws
  const PoseVisionView = useMemo(() => getPoseVisionView(), []);
  const nativeRef = useRef<PoseVisionViewRef | null>(null);
  const expoRef = useRef<CameraView | null>(null);
  const canRecordRef = useRef(false);

  // the native view's handlers are bound once; reading the latest callbacks
  // through refs keeps them from calling a parent's stale closure
  const onStateRef = useRef(onState);
  onStateRef.current = onState;
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;
  const onTelemetryRef = useRef(onTelemetry);
  onTelemetryRef.current = onTelemetry;

  // The camera's state as last reported, plus a count of the poses that came
  // through in the current second. Sent up once a second rather than per
  // frame: a screen that re-renders thirty times a second to print a number
  // costs more than the number is worth.
  const statusRef = useRef<Omit<CameraTelemetry, 'posesPerSec' | 'latencyMs'>>({
    camera: 'starting',
    detector: PoseVisionView !== null ? 'loading' : 'none',
    detail: '',
    canRecord: false,
  });
  const posesRef = useRef({ count: 0, latencySum: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      const { count, latencySum } = posesRef.current;
      posesRef.current = { count: 0, latencySum: 0 };
      onTelemetryRef.current?.({
        ...statusRef.current,
        posesPerSec: count,
        latencyMs: count > 0 ? latencySum / count : null,
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const recorder = useMemo(
    () =>
      new ClipRecorder({
        target: nextClipTarget,
        discard: (uri) => void discardClipFile(uri),
        timeoutMs: FINALIZE_TIMEOUT_MS,
      }),
    [],
  );
  useEffect(() => () => recorder.dispose(), [recorder]);

  useImperativeHandle(
    ref,
    () => ({
      startRecording(maxDurationSec: number) {
        if (!canRecordRef.current) return Promise.resolve(false);
        if (PoseVisionView !== null) {
          return recorder.start(async (target) => {
            const view = nativeRef.current;
            if (!view || !target) throw new Error('the camera is not mounted');
            await view.startRecording(target.path);
          }, true);
        }
        return recorder.start(async () => {
          const cam = expoRef.current;
          if (!cam) throw new Error('the camera is not mounted');
          // resolves when recording ends, however it ends — including by its
          // own duration cap, which the recorder holds for the coming stop
          cam
            .recordAsync({ maxDuration: maxDurationSec })
            .then((res) => recorder.finished(res?.uri ?? null))
            .catch(() => recorder.finished(null));
        }, false);
      },
      stopRecording() {
        return recorder.stop(() =>
          PoseVisionView !== null ? nativeRef.current?.stopRecording() : expoRef.current?.stopRecording(),
        );
      },
    }),
    [PoseVisionView, recorder],
  );

  const fill = { position: 'absolute' as const, top: 0, left: 0, width, height };

  return (
    <View pointerEvents="none" style={fill}>
      {PoseVisionView !== null ? (
        <PoseVisionView
          ref={nativeRef}
          style={{ width, height }}
          facing={facing}
          detecting={detecting}
          onPose={(e) => {
            posesRef.current.count += 1;
            posesRef.current.latencySum += e.nativeEvent.latencyMs || 0;
            publishNativePose(e.nativeEvent);
          }}
          onStatus={(e) => {
            const s = e.nativeEvent;
            publishDetectorState(s.detector, s.detail);
            canRecordRef.current = s.canRecord;
            statusRef.current = { camera: s.camera, detector: s.detector, detail: s.detail, canRecord: s.canRecord };
            if (s.camera === 'ready') {
              onStateRef.current?.({ ready: true, canRecord: s.canRecord, measures: s.detector !== 'unavailable' });
            }
          }}
          onRecordingFinished={(e) => recorder.finishedAtTarget(e.nativeEvent.ok)}
          onCameraError={(e) => {
            const { message, fatal } = e.nativeEvent;
            if (fatal === false) {
              console.warn('[synapse] camera:', message);
              return;
            }
            console.warn('[synapse] camera unavailable, falling back to the void:', message);
            statusRef.current = { ...statusRef.current, camera: 'failed', detail: message };
            onFailedRef.current?.(message);
          }}
        />
      ) : (
        <CameraView
          ref={expoRef}
          style={{ width, height }}
          facing={facing}
          // expo-camera binds its recorder only in video mode; in the default
          // picture mode recordAsync has nothing to record with, and the clip
          // silently never arrives
          mode="video"
          mute
          onCameraReady={() => {
            canRecordRef.current = true;
            statusRef.current = { camera: 'ready', detector: 'none', detail: '', canRecord: true };
            onStateRef.current?.({ ready: true, canRecord: true, measures: false });
          }}
          onMountError={(e) => {
            // another app holds the camera, or the device has none usable
            console.warn('[synapse] camera unavailable, falling back to the void', e);
            statusRef.current = { ...statusRef.current, camera: 'failed', detail: e.message };
            onFailedRef.current?.(e.message);
          }}
        />
      )}
      {dim ? <View style={[fill, { backgroundColor: color.dim }]} /> : null}
    </View>
  );
});

/**
 * The telemetry line, pinned low where neither stage puts a control. Quiet
 * when the path works, amber when a link in it does not — so a tester with no
 * cable and no log can say which link.
 */
export function CameraTelemetryLine({ line }: { line: TelemetryLine }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, bottom: 14 }}>
      <AppText variant="nano" color={line.tone === 'warn' ? color.warn : color.textLo} numberOfLines={1}>
        {line.text}
      </AppText>
    </View>
  );
}
