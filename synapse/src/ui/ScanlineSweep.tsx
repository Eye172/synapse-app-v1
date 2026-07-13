import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { glow } from '@/src/theme/glow';

/**
 * The scanning signature (§2.2): a soft beam sweeping the panel it fills.
 * Measures its own container; honors reduced motion.
 */
export function ScanlineSweep({
  tint = 'rgba(33,240,220,0.5)',
  durationMs = 1600,
}: {
  tint?: string;
  durationMs?: number;
}) {
  const reduced = useReducedMotion();
  const [h, setH] = useState(0);
  const y = useSharedValue(0);

  useEffect(() => {
    if (reduced || h <= 0) return undefined;
    y.value = 0;
    y.value = withRepeat(withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(y);
  }, [reduced, durationMs, y, h]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value * Math.max(0, h - 3) }],
  }));

  if (reduced) return null;

  return (
    <View
      style={[StyleSheet.absoluteFill, { overflow: 'hidden', pointerEvents: 'none' }]}
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
    >
      {h > 0 ? (
        <Animated.View
          style={[{ height: 2, marginHorizontal: 4, backgroundColor: tint, borderRadius: 1 }, glow(tint, 8, 0.8, 0), style]}
        />
      ) : null}
    </View>
  );
}
