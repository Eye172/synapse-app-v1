import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SensorFrame } from '@/src/engine/types';
import { rigLink } from '@/src/sources/udp/rigLink';
import { useConnectionStore } from '@/src/store/connectionStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { color, space } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';
import { Chip } from '@/src/ui/Chip';
import { GridBackdrop } from '@/src/ui/GridBackdrop';
import { PressableScale } from '@/src/ui/PressableScale';
import { RigTuningPanel } from '@/src/ui/RigTuningPanel';
import { Section } from '@/src/ui/Section';

/**
 * Sensor setup — the page you open when the skeleton does not match the body.
 *
 * Two things about a rig cannot be known until it is worn: how its firmware
 * packs a quaternion, and which way the boards are mounted. Both are settings
 * here, with the live readings underneath, so a mismatch is a twenty-second
 * fix by whoever is wearing it rather than a new build.
 */
export default function SensorSetupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mode = useConnectionStore((s) => s.mode);
  const calNodes = useSettingsStore((s) => Object.keys(s.rigCalibration).length);
  const [frame, setFrame] = useState<SensorFrame | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // watch the live link without taking ownership of it
  useEffect(() => {
    const src = rigLink.active;
    if (!src) return undefined;
    unsubRef.current = src.onFrame(setFrame);
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <GridBackdrop />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: 60, gap: space.lg }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: space.gutter, gap: 6 }}>
          <PressableScale onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={{ alignSelf: 'flex-start' }}>
            <AppText variant="micro" color={color.textMid}>
              ‹ PROFILE
            </AppText>
          </PressableScale>
          <AppText variant="h1">Sensor setup</AppText>
          <AppText variant="body">
            Stand upright and still. Every reading below should agree with that — the back pointing up, the limbs
            pointing down. If it does not, change the settings here until it does.
          </AppText>
        </View>

        <Section label="LINK" first>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Chip
              label={mode === 'linked' ? 'RIG CONNECTED' : mode === 'searching' ? 'SEARCHING' : 'NOT CONNECTED'}
              tint={mode === 'linked' ? color.acid : mode === 'searching' ? color.warn : color.textLo}
            />
            <Chip
              label={calNodes > 0 ? `CALIBRATED · ${calNodes} NODES` : 'NOT CALIBRATED'}
              tint={calNodes > 0 ? color.mesh : color.textLo}
            />
            {frame ? <Chip label={`FORMAT · ${frame.protocol.toUpperCase()}`} tint={color.textMid} /> : null}
          </View>
          {mode !== 'linked' ? (
            <PressableScale
              onPress={() => router.push('/connect')}
              accessibilityRole="button"
              accessibilityLabel="Connect the Rig"
              style={{ marginTop: 10 }}
            >
              <AppText variant="micro" color={color.mesh}>
                CONNECT THE RIG ›
              </AppText>
            </PressableScale>
          ) : null}
        </Section>

        <RigTuningPanel />
      </ScrollView>
    </View>
  );
}
