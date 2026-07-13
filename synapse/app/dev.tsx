import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RuleCoach } from '@/src/coach/RuleCoach';
import type { CoachCue } from '@/src/coach/types';
import type { SafetyAlert } from '@/src/engine/ruleEngine';
import { SetEngine, type EngineFrame, type RepRecord } from '@/src/engine/setSession';
import type { SensorFrame } from '@/src/engine/types';
import { EXERCISES } from '@/src/data/exercises';
import { SimPoseSource } from '@/src/sources/sim/SimPoseSource';
import { SimSensorSource } from '@/src/sources/sim/SimSensorSource';
import { SimTimeline, defaultFaultScript, type FaultScript } from '@/src/sources/sim/simTimeline';
import { color, severityColor, space } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';
import { Chip } from '@/src/ui/Chip';
import { GridBackdrop } from '@/src/ui/GridBackdrop';
import { HUDFrame, hudTint } from '@/src/ui/HUDFrame';
import { PressableScale } from '@/src/ui/PressableScale';
import { StatReadout } from '@/src/ui/StatReadout';

type FaultMode = 'none' | 'rep3' | 'constant';

/** Engine diagnostics: the PASS-1 proof that the seams work headlessly. */
export default function DevScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [exId, setExId] = useState('back_squat');
  const [faultMode, setFaultMode] = useState<FaultMode>('rep3');
  const [frame, setFrame] = useState<EngineFrame | null>(null);
  const [sensor, setSensor] = useState<SensorFrame | null>(null);
  const [lastCue, setLastCue] = useState<CoachCue | null>(null);
  const [alert, setAlert] = useState<SafetyAlert | null>(null);
  const [reps, setReps] = useState<RepRecord[]>([]);
  const lastUiUpdate = useRef(0);

  const ex = useMemo(() => EXERCISES.find((e) => e.id === exId)!, [exId]);

  useEffect(() => {
    const fault: FaultScript =
      faultMode === 'none'
        ? { kind: 'none', reps: [], intensity: 0 }
        : faultMode === 'rep3'
          ? defaultFaultScript(ex)
          : { ...defaultFaultScript(ex), reps: Array.from({ length: 500 }, (_, i) => i + 1) };

    const timeline = new SimTimeline(ex, { t0: Date.now(), fault });
    const pose = new SimPoseSource(timeline);
    const rig = new SimSensorSource(timeline);
    const sensorUnsub = rig.onFrame((f) => {
      // throttle text updates to ~12fps; the engine itself runs at full rate
      setSensor(f);
    });

    const engine = new SetEngine(ex, {
      poseSource: pose,
      sensorSource: rig,
      coach: new RuleCoach(),
      events: {
        onFrame: (f) => {
          const now = Date.now();
          if (now - lastUiUpdate.current > 80) {
            lastUiUpdate.current = now;
            setFrame(f);
          }
        },
        onRep: (r) => setReps((prev) => [...prev.slice(-7), r]),
        onCue: (c) => setLastCue(c),
        onAlert: (a) => setAlert(a),
      },
    });

    setReps([]);
    setLastCue(null);
    setAlert(null);
    engine.start();
    return () => {
      sensorUnsub();
      engine.stop();
    };
  }, [ex, faultMode]);

  const spine = sensor?.nodes.find((n) => n.id === 'spine');
  const primary = frame?.metrics[ex.rep.metric];

  return (
    <View style={{ flex: 1 }}>
      <GridBackdrop />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: 60, gap: space.sm, paddingHorizontal: space.gutter }}>
        <PressableScale onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={{ alignSelf: 'flex-start' }}>
          <AppText variant="micro" color={color.textMid}>‹ BACK</AppText>
        </PressableScale>
        <AppText variant="h1">Diagnostics</AppText>

        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {EXERCISES.map((e) => (
            <PressableScale key={e.id} onPress={() => setExId(e.id)} accessibilityRole="button" accessibilityLabel={e.name}>
              <Chip label={e.name.toUpperCase()} tint={exId === e.id ? color.acid : color.textLo} filled={exId === e.id} />
            </PressableScale>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(['none', 'rep3', 'constant'] as FaultMode[]).map((m) => (
            <PressableScale key={m} onPress={() => setFaultMode(m)} accessibilityRole="button" accessibilityLabel={`Fault: ${m}`}>
              <Chip
                label={m === 'none' ? 'FAULT OFF' : m === 'rep3' ? 'FAULT ON REP 3' : 'FAULT ALWAYS'}
                tint={faultMode === m ? color.warn : color.textLo}
                filled={faultMode === m}
              />
            </PressableScale>
          ))}
        </View>

        <HUDFrame tint={hudTint.mesh} style={{ gap: 10 }}>
          <AppText variant="nano" color={color.textLo}>LIVE ENGINE · {frame?.source.toUpperCase() ?? '—'}</AppText>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <StatReadout k="REPS" v={String(frame?.repCount ?? 0)} tint={color.acid} />
            <StatReadout k="PHASE" v={(frame?.repPhase ?? '—').toUpperCase().slice(0, 7)} tint={color.mesh} />
            <StatReadout
              k={ex.rep.metric.toUpperCase().slice(0, 9)}
              v={typeof primary === 'number' ? primary.toFixed(0) : '—'}
              unit="°"
              tint={color.textHi}
            />
            <StatReadout
              k="SPINE·RIG"
              v={spine?.angleDeg !== undefined ? spine.angleDeg.toFixed(0) : '—'}
              unit="°"
              tint={sensor?.flags.alert ? color.error : color.mesh}
            />
          </View>
        </HUDFrame>

        <HUDFrame tint={alert ? hudTint.error : hudTint.dim} style={{ gap: 8 }}>
          <AppText variant="nano" color={alert ? color.error : color.textLo}>
            {alert ? `SAFETY ALERT · ${alert.risk.toUpperCase()}` : 'RULES'}
          </AppText>
          {frame?.grade.evals.map((e) => (
            <View key={e.rule.id} style={{ gap: 3 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="nano" color={color.textMid}>{e.rule.name.toUpperCase()}</AppText>
                <AppText variant="nano" color={e.severity === null ? color.textLo : severityColor(e.severity)}>
                  {e.severity === null
                    ? 'NO DATA'
                    : `${typeof e.value === 'number' ? e.value.toFixed(1) : String(e.value)} · ${(e.severity * 100).toFixed(0)}%`}
                </AppText>
              </View>
              <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <View
                  style={{
                    width: `${Math.min(1, e.severity ?? 0) * 100}%`,
                    height: 3,
                    backgroundColor: e.severity === null ? color.textLo : severityColor(e.severity),
                  }}
                />
              </View>
            </View>
          ))}
        </HUDFrame>

        <HUDFrame tint={hudTint.acid} style={{ gap: 4 }}>
          <AppText variant="nano" color={color.textLo}>RULE COACH · LAST CUE</AppText>
          <AppText variant="h3" color={lastCue ? color.acid : color.textLo}>
            {lastCue ? lastCue.text : 'Quiet. Nothing to fix.'}
          </AppText>
          {lastCue ? (
            <AppText variant="nano" color={color.textLo}>
              {`${lastCue.kind.toUpperCase()} · RULE ${lastCue.ruleId ?? '—'} · HAPTIC ${lastCue.haptic ?? 'NONE'}`}
            </AppText>
          ) : null}
        </HUDFrame>

        <HUDFrame tint={hudTint.dim} style={{ gap: 4 }}>
          <AppText variant="nano" color={color.textLo}>SENSORFRAME · UDP-SHAPE</AppText>
          <AppText variant="monoBody" color={color.textMid}>
            {sensor ? JSON.stringify({ t: sensor.t % 100000, nodes: sensor.nodes, flags: sensor.flags }) : '—'}
          </AppText>
          <AppText variant="nano" color={color.textLo}>RECENT REPS</AppText>
          {reps.length === 0 ? (
            <AppText variant="monoBody" color={color.textLo}>none yet</AppText>
          ) : (
            reps.map((r) => (
              <AppText key={r.index} variant="monoBody" color={r.clean ? color.ok : color.warn}>
                {`#${r.index} ${r.clean ? 'CLEAN' : `FAULT·${r.worstRule?.id ?? Object.keys(r.frameWorst).find((k) => r.frameWorst[k]! >= 1) ?? 'rule'}`} ecc ${(r.timing.eccMs / 1000).toFixed(1)}s con ${(r.timing.conMs / 1000).toFixed(1)}s tempo ${r.tempoScore ?? '—'}`}
              </AppText>
            ))
          )}
        </HUDFrame>
      </ScrollView>
    </View>
  );
}
