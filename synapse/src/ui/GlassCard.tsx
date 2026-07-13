import React from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { color, radius, space } from '@/src/theme/tokens';

/**
 * Soft glass surface — the calm side of the system (radius 20, hairline, glow-free).
 * True backdrop blur is avoided for the Android perf budget; the translucent
 * fill over the void reads as glass on every dark screen.
 */
export function GlassCard({
  style,
  children,
  padded = true,
  heavy = false,
  ...rest
}: ViewProps & { padded?: boolean; heavy?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: heavy ? color.surfaceGlassHeavy : color.surfaceGlass,
          borderRadius: radius.glass,
          borderWidth: 1,
          borderColor: color.hairlineDim,
          overflow: 'hidden',
        },
        padded && { padding: space.md },
        style,
      ]}
    >
      {children}
    </View>
  );
}
