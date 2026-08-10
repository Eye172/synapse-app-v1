import { useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAiKey } from '@/src/coach/aiKeyStore';
import { getExercise } from '@/src/data/exercises';
import type { ExerciseSpec } from '@/src/engine/types';
import type { SetSummary } from '@/src/engine/setSession';
import { createSetSources, type SourceBundle } from '@/src/sources/provider';
import { useSettingsStore } from '@/src/store/settingsStore';
import { color, space } from '@/src/theme/tokens';
import { ArmStage, type TrainConfig } from '@/src/train/ArmStage';
import { LiveStage, type FaultMarker, type LiveResult } from '@/src/train/LiveStage';
import { PositionStage } from '@/src/train/PositionStage';
import { EphemeralClip } from '@/src/train/recording';
import { ReportStage } from '@/src/train/ReportStage';
import { ReviewStage } from '@/src/train/ReviewStage';
import { SelectStage } from '@/src/train/SelectStage';
import { TutorialStage } from '@/src/train/TutorialStage';
import { AppText } from '@/src/ui/AppText';
import { GridBackdrop } from '@/src/ui/GridBackdrop';
import { PressableScale } from '@/src/ui/PressableScale';
import { ScanlineSweep } from '@/src/ui/ScanlineSweep';

type Stage = 'select' | 'loading' | 'tutorial' | 'arm' | 'position' | 'live' | 'review' | 'report';

/**
 * The Training flow (§2.5) — a full-screen modal state machine:
 * SELECT → LOADING → TUTORIAL → ARM (permissions + record/duration) →
 * GET_INTO_POSITION → LIVE_SET → REVIEW (ephemeral) → REPORT → out.
 */
export default function TrainScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { exercise: exerciseParam } = useLocalSearchParams<{ exercise?: string }>();

  const initialEx = getExercise(exerciseParam ?? '') ?? null;
  const [ex, setEx] = useState<ExerciseSpec | null>(initialEx);
  const [stage, setStage] = useState<Stage>(initialEx ? 'loading' : 'select');
  const [config, setConfig] = useState<TrainConfig>({ record: false, durationSec: 30, demoFault: true });
  const [camPerm] = useCameraPermissions();
  const [result, setResult] = useState<LiveResult | null>(null);
  const [aiKey, setAiKeyState] = useState<string | null>(null);
  const demoForced = useSettingsStore((s) => s.demoModeForced);

  // the optional Claude key rides the whole flow; absent ⇒ RuleCoach everywhere
  useEffect(() => {
    let alive = true;
    getAiKey().then((k) => {
      if (alive) setAiKeyState(k);
    });
    return () => {
      alive = false;
    };
  }, []);

  // one ephemeral clip manager per entry into the flow; destroyed with it
  const clipRef = useRef(new EphemeralClip());
  // the set's sources — created when positioning begins, disposed with the flow
  const sourcesRef = useRef<SourceBundle | null>(null);
  useEffect(() => {
    const clip = clipRef.current;
    return () => {
      void clip.deleteNow();
      sourcesRef.current?.dispose();
      sourcesRef.current = null;
    };
  }, []);

  const beginPositioning = () => {
    sourcesRef.current?.dispose();
    sourcesRef.current = createSetSources(ex!, {
      camGranted: camPerm?.granted === true,
      demoFault: config.demoFault,
      forceDemo: demoForced,
    });
    setStage('position');
  };

  // the brief loading beat — the cockpit spinning up
  useEffect(() => {
    if (stage === 'loading') {
      const t = setTimeout(() => setStage('tutorial'), 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [stage]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const showClose = stage !== 'live' && stage !== 'position';

  const summary: SetSummary | null = result?.summary ?? null;
  const markers: FaultMarker[] = result?.faultMarkers ?? [];

  const stageView = useMemo(() => {
    switch (stage) {
      case 'select':
        return (
          <SelectStage
            onSelect={(e) => {
              setEx(e);
              setStage('loading');
            }}
          />
        );
      case 'loading':
        return (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <ScanlineSweep tint="rgba(200,240,60,0.35)" durationMs={900} />
            <AppText variant="nano" color={color.acid}>
              · TRAINING SYSTEMS ·
            </AppText>
            <AppText variant="h2">Spinning up the Mesh</AppText>
            <AppText variant="micro" color={color.textLo}>
              {`LOADING ${ex?.name.toUpperCase() ?? ''} RULESET`}
            </AppText>
          </View>
        );
      case 'tutorial':
        return ex ? <TutorialStage ex={ex} onContinue={() => setStage('arm')} /> : null;
      case 'arm':
        return ex ? (
          <ArmStage ex={ex} config={config} onConfig={setConfig} onBegin={beginPositioning} />
        ) : null;
      case 'position':
        return ex ? <PositionStage ex={ex} sources={sourcesRef.current} onLocked={() => setStage('live')} /> : null;
      case 'live':
        return ex && sourcesRef.current ? (
          <LiveStage
            ex={ex}
            config={config}
            sources={sourcesRef.current}
            clip={clipRef.current}
            camGranted={camPerm?.granted === true}
            aiKey={aiKey}
            onDone={(r) => {
              setResult(r);
              setStage(r.recordedUri ? 'review' : 'report');
            }}
          />
        ) : null;
      case 'review':
        return (
          <ReviewStage
            clip={clipRef.current}
            durationSec={summary?.durationSec ?? config.durationSec}
            markers={markers}
            onContinue={() => setStage('report')}
          />
        );
      case 'report':
        return summary ? <ReportStage summary={summary} aiKey={aiKey} onDone={close} /> : null;
      default:
        return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, ex, config, camPerm?.granted, summary]);

  return (
    <View style={{ flex: 1 }}>
      <GridBackdrop grid={stage !== 'live'} />
      <View style={{ flex: 1, paddingTop: insets.top + (stage === 'live' || stage === 'position' ? 0 : space.sm) }}>
        {showClose ? (
          <View style={{ paddingHorizontal: space.gutter, paddingBottom: 6, flexDirection: 'row', justifyContent: 'flex-end' }}>
            <PressableScale onPress={close} accessibilityRole="button" accessibilityLabel="Close training">
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.14)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(16,20,28,0.6)',
                }}
              >
                <AppText variant="h3" color={color.textMid} style={{ marginTop: -2 }}>
                  ×
                </AppText>
              </View>
            </PressableScale>
          </View>
        ) : null}
        {/* Entering only. An exit animation keeps the outgoing stage mounted
            until it finishes, and these stages own a camera, a recording and
            a running engine — two of them alive at once is not a transition,
            it is a leak. */}
        <Animated.View key={stage} entering={FadeIn.duration(220)} style={{ flex: 1 }}>
          {stageView}
        </Animated.View>
      </View>
    </View>
  );
}
