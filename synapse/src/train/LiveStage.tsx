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
import type { MeshFrame } from '@/src/ui/MeshView';
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
  // The camera tracker follows the camera, whichever source draws the body:
  // beside a Rig it still measures the lifter for the technique evaluator.
  const poseRef = useRef(sources.camera ?? sources.pose);
  poseRef.current = sources.camera ?? sources.pose;
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
          // a fault at full severity is marked on the Review timeline, at most
          // once per 2.5 s per finding, whichever grader raised it
          const mark = (id: string, name: string) => {
            const now = Date.now();
            if (now - (lastMarkerAt.current[id] ?? 0) <= 2500) return;
            lastMarkerAt.current[id] = now;
            markersRef.current.push({ tSec: (now - startedAtRef.current) / 1000, ruleId: id, name });
          };
          const rule = f.grade.worstLive;
          if (rule && rule.severity !== null && rule.severity >= 1) mark(rule.rule.id, rule.rule.name);
          const found = f.technique.computed ? f.technique.worst : null;
          if (found && found.severity >= 1) mark(`technique:${found.segment}:${found.label}`, found.label);
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

  // ---- optional auto-stop ----
  // Counts only time spent lifting: the old clock ran from the start of the
  // set straight through every pause, so a paused set could end itself.
  const activeMsRef = useRef(0);
  useEffect(() => {
    if (config.durationSec === null) return undefined;
    const cap = config.durationSec;
    let last = Date.now();
    const iv = setInterval(() => {
      const now = Date.now();
      if (!paused) activeMsRef.current += now - last;
      last = now;
      const e = Math.floor(activeMsRef.current / 1000);
      setElapsed(e);
      if (e >= cap) finish();
    }, 250);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, config.durationSec]);

  // ---- recording lifecycle ----
  // The camera records and finalizes; this screen decides when, and owns the
  // clip once it exists. Starting waits for the preview, which may already be
  // up — the camera has been running since position-lock.
  useEffect(() => {
    if (!recordRequested || !canRecord || !cameraReady || recordingStartedRef.current) return;
    recordingStartedRef.current = true;
    setRecState('recording');
    // with no auto-stop the clip runs until STOP; ten minutes is a storage guard
    void camera.current?.startRecording(config.durationSec ?? 600).then((started) => {
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
  // shown only when the set will end itself: a countdown to that moment
  const remaining = config.durationSec === null ? null : Math.max(0, config.durationSec - elapsed);
  const clock =
    remaining === null ? null : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  // The fault chip shows whichever grader found the worse problem: a rule
  // from the exercise spec, or the technique evaluator's own finding.
  const ruleFault =
    frame?.grade.worstLive && frame.grade.worstLive.severity !== null
      ? {
          severity: frame.grade.worstLive.severity,
          name: frame.grade.worstLive.rule.name,
          value: typeof frame.grade.worstLive.value === 'number' ? frame.grade.worstLive.value : null,
        }
      : null;
  const techniqueWorst = frame?.technique.computed ? frame.technique.worst : null;
  const techniqueFault = techniqueWorst
    ? { severity: techniqueWorst.severity, name: techniqueWorst.label, value: null }
    : null;
  const fault =
    techniqueFault && (!ruleFault || techniqueFault.severity > ruleFault.severity) ? techniqueFault : ruleFault;
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
    frame && meshLandmarks ? { landmarks: meshLandmarks, segments: frame.severity, t: frame.t } : null;

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
        {/* The body is always 3D, and never made up.

            With a camera that has been solved, the mannequin is built in
            metres around the lifter's own measurements and pushed back
            through the lens that saw them, so it lands on their body —
            translucent over the picture, coloured by the Rig's grading.

            With the Rig drawing and no solved camera, the Rig's own measured
            body is shown from a fixed angle. With the camera as the only
            instrument, nothing is drawn until the solve converges — the
            picture alone, and SOLVING in the status strip — because a figure
            that is not standing on the lifter would be a figure made up. */}
        {tracking.aligned ? (
          <BodyOverlay
            pose={tracking.pose}
            camera={tracking.camera}
            viewport={tracking.viewport ?? undefined}
            severity={frame?.severity}
            width={width}
            height={height}
            dimmed={paused}
          />
        ) : liveMeshSource === 'rig' ? (
          <MeshView3D frame={meshFrame} width={width} height={height} dimmed={paused} />
        ) : null}
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
            // whether the figure is standing on the lifter or still being
            // solved — the one link in the camera path the camera's own
            // telemetry cannot see
            liveMeshSource === 'camera' ? (tracking.aligned ? 'BODY PLACED' : 'SOLVING') : null,
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
            {paused ? 'PAUSED' : clock === null ? 'LIVE' : `ENDS IN ${clock}`}
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
      {fault && fault.severity >= 0.55 && !alert ? (
        <View
          style={{
            position: 'absolute',
            right: 20,
            top: height * 0.24,
            borderWidth: 1,
            borderColor: fault.severity >= 1 ? color.error : color.warn,
            backgroundColor: fault.severity >= 1 ? 'rgba(255,59,92,0.12)' : 'rgba(255,194,75,0.10)',
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 7,
            maxWidth: 150,
          }}
        >
          <AppText variant="nano" color={fault.severity >= 1 ? color.error : color.warn}>
            {fault.severity >= 1 ? 'FAULT' : 'DRIFT'}
          </AppText>
          <AppText variant="micro" color={color.textHi}>
            {fault.name.toUpperCase()}
          </AppText>
          {fault.value !== null ? (
            <AppText variant="nano" color={color.textMid}>
              {`${fault.value.toFixed(0)}°`}
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
