import { CameraView } from 'expo-camera';
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
import { useSettingsStore } from '@/src/store/settingsStore';
import type { SafetyAlert } from '@/src/engine/ruleEngine';
import { SetEngine, type EngineFrame, type SetSummary } from '@/src/engine/setSession';
import type { ExerciseSpec } from '@/src/engine/types';
import { useConnectionStore } from '@/src/store/connectionStore';
import type { SourceBundle } from '@/src/sources/provider';
import { glow } from '@/src/theme/glow';
import { color, space } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';
import { CornerBrackets } from '@/src/ui/CornerBrackets';
import { MeshView, type MeshFrame } from '@/src/ui/MeshView';
import { PressableScale } from '@/src/ui/PressableScale';
import { StatReadout } from '@/src/ui/StatReadout';

import type { TrainConfig } from './ArmStage';
import type { EphemeralClip } from './recording';
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
 * LIVE_SET (§2.5) — the cockpit. Camera (when recording) or the void behind,
 * the Mesh over the body, the left data rail, the mono status strip, the
 * fault chip, the glass coaching pill, STOP and PAUSE.
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
  camGranted,
  aiKey,
  onDone,
}: {
  ex: ExerciseSpec;
  config: TrainConfig;
  sources: SourceBundle;
  clip: EphemeralClip;
  camGranted: boolean;
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

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const facing = useSettingsStore((s) => s.cameraFacing);
  const cameraRef = useRef<CameraView | null>(null);
  const engineRef = useRef<SetEngine | null>(null);
  const markersRef = useRef<FaultMarker[]>([]);
  const lastMarkerAt = useRef<Record<string, number>>({});
  const startedAtRef = useRef(0);
  const doneRef = useRef(false);
  const recordingUriRef = useRef<string | null>(null);
  const recordPromiseRef = useRef<Promise<void> | null>(null);

  const recording = config.record && camGranted;
  /** show the live view whenever we're allowed to and the hardware works */
  const cameraLive = camGranted && !cameraFailed;

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
      if (recording && e >= config.durationSec) finish();
    }, 250);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, recording, config.durationSec]);

  // ---- recording lifecycle ----
  const startRecording = async () => {
    if (!recording || cameraRef.current === null || recState !== 'off') return;
    try {
      setRecState('recording');
      const p = cameraRef.current
        .recordAsync({ maxDuration: config.durationSec })
        .then((res) => {
          if (res?.uri) {
            recordingUriRef.current = res.uri;
            clip.attach(res.uri);
          }
        })
        .catch((e) => {
          console.warn('[synapse] recording failed', e);
          recordingUriRef.current = null;
        });
      recordPromiseRef.current = p.then(() => {});
    } catch (e) {
      console.warn('[synapse] recording could not start', e);
      setRecState('off');
    }
  };

  const stopRecording = async () => {
    if (recState !== 'recording') return;
    setRecState('stopping');
    try {
      cameraRef.current?.stopRecording();
      await recordPromiseRef.current;
    } catch {
      // clip stays null — review will be skipped
    }
  };

  // background mid-set: stop everything, kill any clip (deal-breaker 1)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        stopSpeech();
        engineRef.current?.pause();
        setPaused(true);
        if (recState === 'recording') {
          cameraRef.current?.stopRecording();
        }
        void clip.deleteNow();
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

  return (
    <View style={{ flex: 1, backgroundColor: color.void }}>
      {/* The real camera sits behind the Mesh whenever it is allowed to —
          seeing yourself under the skeleton is most of the point. It is
          darkened so the graded segments stay readable over any gym. */}
      {cameraLive ? (
        <>
          <CameraView
            ref={cameraRef}
            style={{ position: 'absolute', top: 0, left: 0, width, height }}
            facing={facing}
            mute
            onCameraReady={() => {
              setCameraReady(true);
              if (recording) startRecording();
            }}
            onMountError={(e) => {
              // another app holds the camera, or the device has none usable
              console.warn('[synapse] camera unavailable, falling back to the void', e);
              setCameraFailed(true);
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width,
              height,
              backgroundColor: 'rgba(6,7,11,0.52)',
            }}
          />
        </>
      ) : null}

      <View style={{ position: 'absolute', top: 0, left: 0 }}>
        <MeshView frame={frame ? { landmarks: frame.pose.landmarks, segments: frame.grade.segments, t: frame.t } : null} width={width} height={height} dimmed={paused} />
      </View>

      {/* A simulated body must never be mistaken for the user's own. The Rig
          can drop out mid-set and the Mesh keeps moving on scripted data —
          honest for a demo, dangerous during a hardware test. If a real
          source was expected and we are drawing the simulator instead, say so
          in words nobody can miss. */}
      {sources.poseOrigin !== 'sim' && liveMeshSource === 'sim' ? (
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
            SIMULATED BODY — NOT YOU
          </AppText>
          <AppText variant="nano" color={color.warn} align="center" style={{ marginTop: 4 }}>
            {sources.poseOrigin === 'rig'
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
            borderColor: 'rgba(255,255,255,0.08)',
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
              backgroundColor: 'rgba(16,20,28,0.7)',
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
