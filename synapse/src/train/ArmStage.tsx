import { useCameraPermissions } from 'expo-camera';
import React from 'react';
import { ScrollView, Switch, View } from 'react-native';

import type { ExerciseSpec } from '@/src/engine/types';
import { useConnectionStore } from '@/src/store/connectionStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { color, space } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';
import { Chip } from '@/src/ui/Chip';
import { GlassCard } from '@/src/ui/GlassCard';
import { HUDFrame, hudTint } from '@/src/ui/HUDFrame';
import { PressableScale } from '@/src/ui/PressableScale';
import { PrimaryButton } from '@/src/ui/PrimaryButton';

export const DURATIONS = [15, 30, 60, 90] as const;
export type SetDuration = (typeof DURATIONS)[number];

export interface TrainConfig {
  record: boolean;
  durationSec: SetDuration;
  demoFault: boolean;
}

/**
 * Arm the set: camera permission, record toggle + fixed-stop duration bar
 * (§2.5), the demo fault injector, and honest source status lines.
 */
export function ArmStage({
  ex,
  config,
  onConfig,
  onBegin,
}: {
  ex: ExerciseSpec;
  config: TrainConfig;
  onConfig: (c: TrainConfig) => void;
  onBegin: () => void;
}) {
  const [camPerm, requestCam] = useCameraPermissions();
  const mode = useConnectionStore((s) => s.mode);
  const camGranted = camPerm?.granted === true;
  const facing = useSettingsStore((s) => s.cameraFacing);
  const setSetting = useSettingsStore((s) => s.set);
  const camDenied = camPerm?.granted === false && camPerm?.canAskAgain === false;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: 48, gap: space.sm }} showsVerticalScrollIndicator={false}>
      <AppText variant="nano" color={color.acid}>
        {`· TRAINING · ${ex.name.toUpperCase()} · ARM ·`}
      </AppText>
      <AppText variant="h1">Arm the set</AppText>

      <HUDFrame tint={hudTint.mesh} style={{ gap: 10 }}>
        <AppText variant="nano" color={color.textLo}>
          SOURCES
        </AppText>
        <StatusLine
          k="MESH"
          v={mode === 'linked' ? 'RIG + SIM POSE' : 'SIMULATOR'}
          tint={color.mesh}
        />
        <StatusLine
          k="RIG"
          v={mode.toUpperCase()}
          tint={mode === 'linked' ? color.acid : mode === 'sim' ? color.blue : color.textLo}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <StatusLine
            k="CAMERA"
            v={camGranted ? 'GRANTED' : camDenied ? 'DENIED · DEMO VISUALS' : 'NOT REQUESTED'}
            tint={camGranted ? color.ok : camDenied ? color.warn : color.textLo}
          />
          {!camGranted && !camDenied ? (
            <PressableScale onPress={() => requestCam()} accessibilityRole="button" accessibilityLabel="Request camera permission">
              <Chip label="REQUEST" tint={color.acid} filled />
            </PressableScale>
          ) : null}
        </View>
        {camGranted ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <StatusLine k="LENS" v={facing === 'front' ? 'FRONT · WATCH YOURSELF' : 'BACK · PROPPED PHONE'} tint={color.mesh} />
            <PressableScale
              onPress={() => setSetting({ cameraFacing: facing === 'front' ? 'back' : 'front' })}
              accessibilityRole="button"
              accessibilityLabel="Switch camera lens"
            >
              <Chip label="SWITCH" tint={color.mesh} />
            </PressableScale>
          </View>
        ) : null}
        <AppText variant="nano" color={color.textLo}>
          FRAMES STAY ON THIS DEVICE. NOTHING UPLOADS.
        </AppText>
      </HUDFrame>

      <GlassCard style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <AppText variant="bodyMed">Record this set</AppText>
            <AppText variant="nano" color={color.textLo} style={{ marginTop: 2 }}>
              {camGranted
                ? 'MUTED CLIP · REVIEW ONCE · HARD-DELETED ON EXIT'
                : 'NEEDS THE CAMERA — GRANT IT ABOVE'}
            </AppText>
          </View>
          <Switch
            value={config.record && camGranted}
            disabled={!camGranted}
            onValueChange={(v) => onConfig({ ...config, record: v })}
            trackColor={{ false: 'rgba(255,255,255,0.12)', true: 'rgba(200,240,60,0.5)' }}
            thumbColor={config.record && camGranted ? color.acid : color.textLo}
          />
        </View>

        <View style={{ gap: 6, opacity: config.record && camGranted ? 1 : 0.35 }}>
          <AppText variant="nano" color={color.textLo}>
            CLIP LENGTH · SET AUTO-ENDS AT CAP
          </AppText>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {DURATIONS.map((d) => {
              const active = config.durationSec === d;
              return (
                <PressableScale
                  key={d}
                  style={{ flex: 1 }}
                  onPress={() => onConfig({ ...config, durationSec: d })}
                  accessibilityRole="button"
                  accessibilityLabel={`${d} second clip`}
                  disabled={!config.record || !camGranted}
                >
                  <View
                    style={{
                      paddingVertical: 10,
                      alignItems: 'center',
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: active ? color.acid : 'rgba(255,255,255,0.1)',
                      backgroundColor: active ? 'rgba(200,240,60,0.14)' : 'transparent',
                    }}
                  >
                    <AppText variant="monoValue" color={active ? color.acid : color.textMid} style={{ fontSize: 16 }}>
                      {d}s
                    </AppText>
                  </View>
                </PressableScale>
              );
            })}
          </View>
        </View>
      </GlassCard>

      <GlassCard style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <AppText variant="bodyMed">Demo fault · rep 3</AppText>
          <AppText variant="nano" color={color.textLo} style={{ marginTop: 2 }}>
            SIMULATOR INJECTS A FORM BREAK SO YOU SEE THE RED
          </AppText>
        </View>
        <Switch
          value={config.demoFault}
          onValueChange={(v) => onConfig({ ...config, demoFault: v })}
          trackColor={{ false: 'rgba(255,255,255,0.12)', true: 'rgba(255,194,75,0.5)' }}
          thumbColor={config.demoFault ? color.warn : color.textLo}
        />
      </GlassCard>

      {ex.riskLevel === 3 ? (
        <AppText variant="nano" color={color.warn} align="center">
          RISK 3 LIFT — WARM UP BEFORE LOADING THE BAR.
        </AppText>
      ) : null}

      <PrimaryButton title="Begin positioning" sub="THE GHOST FRAME WILL GUIDE YOU" onPress={onBegin} />
    </ScrollView>
  );
}

function StatusLine({ k, v, tint }: { k: string; v: string; tint: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: tint }} />
      <AppText variant="micro" color={color.textMid}>
        {k}
      </AppText>
      <AppText variant="micro" color={tint}>
        {v}
      </AppText>
    </View>
  );
}
