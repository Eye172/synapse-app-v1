import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { LINK_LABEL, useConnectionStore } from '@/src/store/connectionStore';
import { glow } from '@/src/theme/glow';
import { color, radius } from '@/src/theme/tokens';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

const MODE_TINT = {
  linked: color.acid,
  sim: color.blue,
  searching: color.warn,
  offline: color.textLo,
} as const;

/** Persistent Rig state chip (§2.3). Tapping opens the Connect sheet. */
export function ConnectionChip() {
  const mode = useConnectionStore((s) => s.mode);
  const nodeCount = useConnectionStore((s) => s.nodeCount);
  const hz = useConnectionStore((s) => s.hz);
  const router = useRouter();
  const tint = MODE_TINT[mode];

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (mode === 'searching') {
      pulse.value = withRepeat(withSequence(withTiming(0.25, { duration: 550 }), withTiming(1, { duration: 550 })), -1);
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [mode, pulse]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const detail =
    mode === 'linked' ? ` · ${nodeCount} NODE${nodeCount === 1 ? '' : 'S'} · ${hz}HZ` : mode === 'sim' ? ' · 30HZ' : '';

  return (
    <PressableScale
      onPress={() => router.push('/connect')}
      accessibilityRole="button"
      accessibilityLabel={`Rig connection: ${LINK_LABEL[mode]}. Open connect screen.`}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          borderRadius: radius.hudSm,
          borderWidth: 1,
          borderColor: `${tint}55`,
          backgroundColor: `${tint}10`,
          paddingHorizontal: 9,
          paddingVertical: 5,
        }}
      >
        <Animated.View
          style={[
            { width: 6, height: 6, borderRadius: 3, backgroundColor: tint },
            glow(tint, 5, 0.9, 0),
            dotStyle,
          ]}
        />
        <AppText variant="nano" color={tint}>
          {LINK_LABEL[mode]}
          {detail}
        </AppText>
      </View>
    </PressableScale>
  );
}
