import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { buzz } from '@/src/coach/haptics';
import { LLMCoach } from '@/src/coach/LLMCoach';
import { RuleCoach } from '@/src/coach/RuleCoach';
import { speakCue, stopSpeech } from '@/src/coach/speech';
import type { Coach, CoachCue } from '@/src/coach/types';
import type { SafetyAlert } from '@/src/engine/ruleEngine';
import { SetEngine, type EngineFrame, type SetSummary } from '@/src/engine/setSession';
import type { ExerciseSpec, PoseFrame } from '@/src/engine/types';
import type { SourceBundle } from '@/src/sources/provider';
import { useConnectionStore } from '@/src/store/connectionStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { glow } from '@/src/theme/glow';
import { color, space } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';
import { BodyOverlay } from '@/src/ui/BodyOverlay';
import { CornerBrackets } from '@/src/ui/CornerBrackets';
import { MeshView, type MeshFrame } from '@/src/ui/MeshView';
import { MeshView3D } from '@/src/ui/MeshView3D';
import { PressableScale } from '@/src/ui/PressableScale';
import { StatReadout } from '@/src/ui/StatReadout';
import { useBodyTracking } from '@/src/vision/useBodyTracking';
import { coverViewport, landmarksToScreen } from '@/src/vision/viewport';

import type { TrainConfig } from './ArmStage';
import type { EphemeralClip } from './recording';
import type { SetCameraHandle } from './SetCamera';
import { useKeepAwakeSafe } from './useKeepAwakeSafe';

export interface FaultMarker {
  tSec: number;
  ruleId: string;
  name: string;
}

export interface LiveResult {
  summary: SetSummary;
  faultMarkers: FaultMarker[];
  recordedUri: string | null;
}

/**
 * LIVE_SET (§2.5) — the cockpit. The flow's camera behind it (or the void when
 * there is none), the Mesh over the body, the left data rail, the mono status
 * strip, the fault chip, the glass coaching pill, STOP and PAUSE.
 *
 * The camera itself is not owned here: it is started for position-lock and
 * outlives the handover to this screen. This screen decides when to record
 * and owns the clip once it exists.
 * Must read like materials/deliverables/synapse-hud-mockup.html.
 */
/** What the HUD calls whatever is currently drawing the body. */
const MESH_SOURCE_LABEL: Record<'sim' | 'camera' | 'rig', string> = {
  rig: 'RIG',
  camera: 'CAMERA',
  sim: 'SIM',
};

/** The big acid rep number, pulsing once per counted rep (§2.2 motion). */
function RepCounterDisplay({ count }: { count: number }) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const prev = useRef(count);
  useEffect(() => {
    if (count > prev.current && !reduced) {
      scale.value = 1.28;
      scale.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) });
    }
    prev.current = count;
  }, [count, reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[{ transformOrigin: 'left center' }, style]}>
      <AppText variant="display" color={color.acid} style={{ fontSize: 46, lineHeight: 50 }} accessibilityLabel={`Rep count ${count}`}>
        {String(count).padStart(2, '0')}
      </AppText>
    </Animated.View>
  );
}

export function LiveStage({
  ex,
  config,
  sources,
  clip,
  camera,
  cameraLive,
  cameraReady,
  canRecord,
  aiKey,
  onDone,
}: {
  ex: ExerciseSpec;
  config: TrainConfig;
  sources: SourceBundle;
  clip: EphemeralClip;
  /** the set's camera, owned by the flow so it survives from position-lock */
  camera: React.RefObject<SetCameraHandle | null>;
  /** the camera is running behind this screen */
  cameraLive: boolean;
  /** its preview is up */
  cameraReady: boolean;
  /** it can record alongside everything else it is running */
  canRecord: boolean;
  /** optional Anthropic key — present ⇒ LLMCoach, absent ⇒ RuleCoach + OFFLINE chip */
  aiKey: string | null;
  onDone: (r: LiveResult) => void;
}) {
  useKeepAwakeSafe();
  const { width, height } = useWindowDimensions();
  const linkMode = useConnectionStore((s) => s.mode);
  const [frame, setFrame] = useState<EngineFrame | null>(null);
  const [cue, setCue] = useState<CoachCue | null>(null);
  const [alert, setAlert] = useState<SafetyAlert | null>(null);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recState, setRecState] = useState<'off' | 'recording' | 'stopping'>('off');

  // Stable across renders on purpose: the tracker holds the body it has
  // measured, and resubscribing would reset it every time a rep ticked.
  const poseRef = useRef(sources.pose);
  poseRef.current = sources.pose;
  const subscribePose = useMemo(
    () => (cb: (f: PoseFrame) => void) => poseRef.current.onPose(cb),
    [],
  );

  const facing = useSettingsStore((s) => s.cameraFacing);
  const recordingStartedRef = useRef(false);
  const engineRef = useRef<SetEngine | null>(null);
  const markersRef = useRef<FaultMarker[]>([]);
  const lastMarkerAt = useRef<Record<string, number>>({});
  const startedAtRef = useRef(0);
  const doneRef = useRef(false);

  /** the wearer asked for a clip, and there is a camera to take one with */
  const recordRequested = config.record && cameraLive;

  // ---- engine ----
  useEffect(() => {
    doneRef.current = false;
    markersRef.current = [];
    lastMarkerAt.current = {};
    startedAtRef.current = Date.now();

    sources.startSet();

    // every cue schedules a dismissal; they are tracked so none of them can
    // fire into an unmounted screen
    const cueTimers = new Set<ReturnType<typeof setTimeout>>();
    const handleCue = (c: CoachCue) => {
      const quiet = useSettingsStore.getState().coachVerbosity === 'quiet';
      setCue(c);
      // quiet verbosity mutes spoken corrections; safety always speaks (§2.8)
      if (c.speak && (c.kind === 'safety' || !quiet)) speakCue(c.text, { urgent: c.kind === 'safety' });
      if (c.haptic) buzz(c.haptic);
      // a cue is a moment, not a banner — clear it after a beat
      const timer = setTimeout(() => {
        cueTimers.delete(timer);
        setCue((cur) => (cur === c ? null : cur));
      }, 4500);
      cueTimers.add(timer);
    };

    // LLM narrates only when the user brought a key; the rules always grade
    const coach: Coach = aiKey ? new LLMCoach({ apiKey: aiKey, onCue: handleCue }) : new RuleCoach();

    const engine = new SetEngine(ex, {
      poseSource: sources.pose,
      sensorSource: sources.sensor,
      ownsSensor: sources.ownsSensor,
      calibration: sources.calibration,
      coach,
      events: {
        onFrame: (f) => {
          setFrame(f);
          if (f.grade.worstLive && f.grade.worstLive.severity !== null && f.grade.worstLive.severity >= 1) {
            const id = f.grade.worstLive.rule.id;
            const now = Date.now();
            if (now - (lastMarkerAt.current[id] ?? 0) > 2500) {
              lastMarkerAt.current[id] = now;
              markersRef.current.push({
                tSec: (now - startedAtRef.current) / 1000,
                ruleId: id,
                name: f.grade.worstLive.rule.name,
              });
            }
          }
        },
        onCue: handleCue,
        onAlert: (a) => setAlert(a),
        onRep: () => buzz('rep'),
      },
    });
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.stop();
      stopSpeech();
      for (const t of cueTimers) clearTimeout(t);
      cueTimers.clear();
      // abandon any cue still racing its deadline — a correction that lands
      // after the bar is racked is worse than silence
      if (coach instanceof LLMCoach) coach.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex, sources, aiKey]);

  // ---- clock + duration cap ----
  useEffect(() => {
    const iv = setInterval(() => {
      if (paused) return;
      const e = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(e);
      if (recordRequested && e >= config.durationSec) finish();
    }, 250);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, recordRequested, config.durationSec]);

  // ---- recording lifecycle ----
  // The camera records and finalizes; this screen decides when, and owns the
  // clip once it exists. Starting waits for the preview, which may already be
  // up — the camera has been running since position-lock.
  useEffect(() => {
    if (!recordRequested || !canRecord || !cameraReady || recordingStartedRef.current) return;
    recordingStartedRef.current = true;
    setRecState('recording');
    void camera.current?.startRecording(config.durationSec).then((started) => {
      if (!started) setRecState('off');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordRequested, canRecord, cameraReady]);

  const stopRecording = async () => {
    if (recState !== 'recording') return;
    setRecState('stopping');
    // resolves only once the clip is complete on disk, or null — never a
    // half-written file; with no clip, Review is simply skipped
    const uri = (await camera.current?.stopRecording()) ?? null;
    if (uri) clip.attach(uri);
    setRecState('off');
  };

  // background mid-set: stop everything, kill any clip (deal-breaker 1)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        stopSpeech();
        engineRef.current?.pause();
        setPaused(true);
        void clip.deleteNow();
        // the clip is already condemned: whatever arrives is attached to a
        // deleted manager, which removes it on sight
        if (recState === 'recording') {
          void camera.current?.stopRecording().then((uri) => {
            if (uri) clip.attach(uri);
          });
        }
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recState]);

  const finish = async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    const engine = engineRef.current;
    await stopRecording();
    engine?.stop();
    stopSpeech();
    onDone({
      summary: engine?.getSummary() ?? emptySummary(ex),
      faultMarkers: markersRef.current,
      recordedUri: clip.currentUri,
    });
  };

  const togglePause = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (paused) {
      engine.resume();
      setPaused(false);
    } else {
      engine.pause();
      stopSpeech();
      setPaused(true);
    }
  };

  const primary = frame?.metrics[ex.rep.metric];
  const lastTempo = useMemo(() => {
    const reps = frame?.repCount ?? 0;
    return reps > 0 ? engineRef.current?.getSummary().tempoAdherence ?? null : null;
  }, [frame?.repCount]);
  const sym = frame?.metrics.symmetry ?? null;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const worst = frame?.grade.worstLive ?? null;
  // what is drawing the body *right now* — the bundle's choice can be
  // overridden at runtime when a source stalls
  const liveMeshSource = frame?.pose.source ?? sources.poseOrigin;
  // The Rig drew this body; if it stops sending, the Mesh holds its last
  // shape. A frozen skeleton reads exactly like a still one — the lifter has
  // to be told the difference, mid-set, without looking away from the bar.
  const rigLinkLost = sources.poseOrigin === 'rig' && linkMode !== 'linked';
  // A camera pose is in the frame's own coordinates, unmirrored; the flat
  // skeleton is drawn over a preview that is cropped to the screen and, from
  // the front camera, mirrored. Drawn as-is it would sit beside the lifter
  // and step left when they step right.
  const meshLandmarks = frame
    ? frame.pose.source === 'camera' && frame.pose.frame
      ? landmarksToScreen(frame.pose.landmarks, coverViewport(frame.pose.frame, { width, height }, facing === 'front'))
      : frame.pose.landmarks
    : null;
  const meshFrame: MeshFrame | null =
    frame && meshLandmarks ? { landmarks: meshLandmarks, segments: frame.grade.segments, t: frame.t } : null;

  // The camera path tracks, measures and places the body itself; the rig
  // path has no picture to land on and is posed from a chosen angle
  // instead. Both end up in the same renderer.
  const tracking = useBodyTracking(subscribePose, {
    width,
    height,
    mirrored: facing === 'front',
    paused,
  });

  return (
    // The flow draws the camera behind this screen, so with one running the
    // background has to let it through; without one, this is the void.
    <View style={{ flex: 1, backgroundColor: cameraLive ? 'transparent' : color.void }}>
      <View style={{ position: 'absolute', top: 0, left: 0 }}>
        {/* Three cases, one renderer.

            With a camera that has been solved, the mannequin is built in
            metres around the lifter's own measurements and pushed back
            through the lens that saw them, so it lands on their body —
            translucent, over a dimmed background, because the point is to
            compare the model with the person and an opaque figure would
            hide what it is commenting on.

            With the Rig there is no picture to land on, so the same solids
            are shown from a chosen angle instead.

            And when the camera is running but the solve has not converged,
            the flat skeleton is drawn rather than a solid figure planted
            confidently in the wrong place. */}
        {tracking.aligned ? (
          <BodyOverlay
            pose={tracking.pose}
            camera={tracking.camera}
            viewport={tracking.viewport ?? undefined}
            severity={frame?.grade.segments}
            width={width}
            height={height}
            dimmed={paused}
          />
        ) : liveMeshSource === 'rig' ? (
          <MeshView3D frame={meshFrame} width={width} height={height} dimmed={paused} />
        ) : (
          <MeshView frame={meshFrame} width={width} height={height} dimmed={paused} />
        )}
      </View>

      {/* The instrument stopped measuring. Whether the link dropped or a
          development build slipped the simulator in behind a real source, the
          body on screen is no longer the lifter's — and a Mesh that looks
          alive while nothing is being measured is the one failure mode that
          can get somebody hurt. Say it in words nobody can miss. */}
      {rigLinkLost || (sources.poseOrigin !== 'sim' && liveMeshSource === 'sim') ? (
        <View
          style={{
            position: 'absolute',
            top: height * 0.30,
            left: 24,
            right: 24,
            alignItems: 'center',
            paddingVertical: 14,
            paddingHorizontal: 16,
            backgroundColor: 'rgba(255,194,75,0.14)',
            borderWidth: 1.5,
            borderColor: color.warn,
            pointerEvents: 'none',
          }}
        >
          <AppText variant="h3" color={color.warn} align="center">
            {rigLinkLost ? 'RIG LINK LOST' : 'NOT YOUR BODY'}
          </AppText>
          <AppText variant="nano" color={color.warn} align="center" style={{ marginTop: 4 }}>
            {rigLinkLost
              ? 'THE MESH IS FROZEN. THIS SET IS NO LONGER BEING GRADED.'
              : sources.poseOrigin === 'rig'
                ? 'THE RIG STOPPED SENDING. NOTHING HERE IS MEASURED FROM YOU.'
                : 'THE CAMERA STOPPED TRACKING. NOTHING HERE IS MEASURED FROM YOU.'}
          </AppText>
        </View>
      ) : null}

      {/* frame brackets */}
      <View style={{ position: 'absolute', top: space.xl + 18, left: 10, right: 10, bottom: 96, pointerEvents: 'none' }}>
        <CornerBrackets size={22} tint={alert ? 'rgba(255,59,92,0.8)' : 'rgba(33,240,220,0.4)'} thickness={1.5} />
      </View>

      {/* top status strip */}
      <View
        style={{
          position: 'absolute',
          top: space.xl + 26,
          left: 20,
          right: 20,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <AppText variant="nano" color={color.textMid}>
          {[
            `MESH · ${MESH_SOURCE_LABEL[liveMeshSource]}`,
            cameraLive ? (cameraReady ? 'CAM LIVE' : 'CAM WAKING') : null,
            aiKey ? null : 'AI OFFLINE',
          ]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {recState === 'recording' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.error }} />
              <AppText variant="nano" color={color.error}>
                REC
              </AppText>
            </View>
          ) : null}
          <AppText variant="nano" color={paused ? color.warn : color.textMid}>
            {paused ? 'PAUSED' : `SET ${mm}:${ss}`}
          </AppText>
        </View>
      </View>

      {/* left data rail */}
      <View style={{ position: 'absolute', left: 20, top: height * 0.2, gap: 14 }}>
        <StatReadout
          k="ANGLE"
          v={typeof primary === 'number' ? String(Math.round(primary)) : '—'}
          unit="°"
          tint={color.textHi}
          fill={typeof primary === 'number' ? Math.min(1, Math.max(0, (primary - 40) / 140)) : undefined}
        />
        <StatReadout k="TEMPO" v={lastTempo === null ? '—' : String(lastTempo)} unit={lastTempo === null ? undefined : '%'} tint={color.mesh} />
        <View>
          <AppText variant="nano" color={color.textLo}>
            REP
          </AppText>
          <RepCounterDisplay count={frame?.repCount ?? 0} />
        </View>
        <StatReadout k="SYM" v={sym === null ? '—' : String(Math.round(sym))} unit={sym === null ? undefined : '%'} tint={color.mesh} />
      </View>

      {/* fault chip */}
      {worst && worst.severity !== null && worst.severity >= 0.55 && !alert ? (
        <View
          style={{
            position: 'absolute',
            right: 20,
            top: height * 0.24,
            borderWidth: 1,
            borderColor: worst.severity >= 1 ? color.error : color.warn,
            backgroundColor: worst.severity >= 1 ? 'rgba(255,59,92,0.12)' : 'rgba(255,194,75,0.10)',
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 7,
            maxWidth: 150,
          }}
        >
          <AppText variant="nano" color={worst.severity >= 1 ? color.error : color.warn}>
            {worst.severity >= 1 ? 'FAULT' : 'DRIFT'}
          </AppText>
          <AppText variant="micro" color={color.textHi}>
            {worst.rule.name.toUpperCase()}
          </AppText>
          {typeof worst.value === 'number' ? (
            <AppText variant="nano" color={color.textMid}>
              {`${worst.value.toFixed(0)}°`}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {/* safety alert */}
      {alert ? (
        <View
          style={{
            pointerEvents: 'none',
            position: 'absolute',
            top: height * 0.16,
            left: 30,
            right: 30,
            alignItems: 'center',
            borderWidth: 1.5,
            borderColor: color.error,
            backgroundColor: 'rgba(255,59,92,0.14)',
            borderRadius: 8,
            paddingVertical: 10,
          }}
        >
          <AppText variant="micro" color={color.error}>
            {`⚠ SAFETY · ${alert.risk.toUpperCase()}`}
          </AppText>
          <AppText variant="h3" color={color.error}>
            {alert.cue.toUpperCase()}
          </AppText>
        </View>
      ) : null}

      {/* coaching pill */}
      {cue && !alert ? (
        <View
          style={{
            position: 'absolute',
            bottom: 168,
            left: 40,
            right: 40,
            alignItems: 'center',
            backgroundColor: 'rgba(14,18,26,0.85)',
            borderColor: color.line,
            borderWidth: 1,
            borderRadius: 999,
            paddingVertical: 9,
            paddingHorizontal: 18,
          }}
        >
          <AppText variant="bodySemi" color={color.textHi}>
            {cue.text}
          </AppText>
        </View>
      ) : null}

      {/* controls */}
      <View style={{ position: 'absolute', bottom: 44, left: 20, right: 20, flexDirection: 'row', gap: 10 }}>
        <PressableScale style={{ flex: 1 }} onPress={togglePause} accessibilityRole="button" accessibilityLabel={paused ? 'Resume set' : 'Pause set'}>
          <View
            style={{
              paddingVertical: 14,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              backgroundColor: color.panelSolid,
            }}
          >
            <AppText variant="bodySemi" color={color.textMid}>
              {paused ? 'RESUME' : 'PAUSE'}
            </AppText>
          </View>
        </PressableScale>
        <PressableScale style={{ flex: 2 }} onPress={finish} accessibilityRole="button" accessibilityLabel="Stop set">
          <View
            style={[
              { paddingVertical: 14, borderRadius: 8, alignItems: 'center', backgroundColor: color.error },
              glow(color.error, 14, 0.5, 8),
            ]}
          >
            <AppText variant="bodySemi" color={color.inkOnError} style={{ letterSpacing: 2 }}>
              STOP
            </AppText>
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

function emptySummary(ex: ExerciseSpec): SetSummary {
  return {
    exerciseId: ex.id,
    exerciseName: ex.name,
    startedAt: Date.now(),
    endedAt: Date.now(),
    durationSec: 0,
    reps: 0,
    cleanReps: 0,
    techniqueScore: 0,
    tempoAdherence: null,
    symmetryAvg: null,
    safetyAlerts: 0,
    ruleResults: [],
    dataSource: 'sim',
    repRecords: [],
  };
}
