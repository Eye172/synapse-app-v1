import { useCameraPermissions } from 'expo-camera';
import React from 'react';
import { ScrollView, Switch, View } from 'react-native';

import type { ExerciseSpec } from '@/src/engine/types';
import { CameraPoseSource } from '@/src/sources/camera/CameraPoseSource';
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
}

/**
 * Arm the set: camera permission, record toggle + fixed-stop duration bar
 * (§2.5), and honest source status lines. The Rig comes first: without a
 * linked Rig the only way forward is to connect it.
 */
export function ArmStage({
  ex,
  config,
  onConfig,
  onBegin,
  onConnect,
}: {
  ex: ExerciseSpec;
  config: TrainConfig;
  onConfig: (c: TrainConfig) => void;
  onBegin: () => void;
  /** open the Connect screen — the only action offered until the Rig links */
  onConnect: () => void;
}) {
  const [camPerm, requestCam] = useCameraPermissions();
  const mode = useConnectionStore((s) => s.mode);
  const camGranted = camPerm?.granted === true;
  const facing = useSettingsStore((s) => s.cameraFacing);
  const setSetting = useSettingsStore((s) => s.set);
  const camDenied = camPerm?.granted === false && camPerm?.canAskAgain === false;
  const rigLinked = mode === 'linked';
  // the camera only shows: with a detector it lays the exoskeleton over the
  // picture, without one the Rig's own figure is drawn instead
  const cameraOverlay = camGranted && CameraPoseSource.available();
  const gradedBy = rigLinked ? 'RIG · FULL BODY' : __DEV__ ? 'SIMULATOR · DEV BUILD' : 'CONNECT THE RIG FIRST';
  const gradedTint = rigLinked ? color.mesh : __DEV__ ? color.warn : color.error;
  const shownAs = cameraOverlay ? 'EXOSKELETON OVER CAMERA' : 'RIG FIGURE';

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
        <StatusLine k="GRADED BY" v={gradedBy} tint={gradedTint} />
        <StatusLine k="SHOWN AS" v={shownAs} tint={color.mesh} />
        <StatusLine
          k="RIG"
          v={mode.toUpperCase()}
          tint={mode === 'linked' ? color.acid : mode === 'searching' ? color.warn : color.textLo}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <StatusLine
            k="CAMERA"
            v={camGranted ? 'GRANTED' : camDenied ? 'DENIED IN SYSTEM SETTINGS' : 'NOT REQUESTED'}
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
            trackColor={{ false: color.lineStrong, true: 'rgba(200,240,60,0.5)' }}
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
                      borderColor: active ? color.acid : color.line,
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

      {ex.riskLevel === 3 ? (
        <AppText variant="nano" color={color.warn} align="center">
          RISK 3 LIFT — WARM UP BEFORE LOADING THE BAR.
        </AppText>
      ) : null}

      {rigLinked || __DEV__ ? (
        <PrimaryButton title="Begin positioning" sub="THE GHOST FRAME WILL GUIDE YOU" onPress={onBegin} />
      ) : (
        <PrimaryButton title="Connect the Rig" sub="THE RIG FIRST · THEN THE SET" onPress={onConnect} />
      )}
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
