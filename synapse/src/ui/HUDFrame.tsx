import React from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { color, radius, space } from '@/src/theme/tokens';

import { CornerBrackets } from './CornerBrackets';

/** Sharp technical frame with corner brackets — for anything live (§2.2). */
export function HUDFrame({
  style,
  children,
  tint = 'rgba(200,240,60,0.55)',
  padded = true,
  bracketSize = 16,
  ...rest
}: ViewProps & {
  tint?: string;
  padded?: boolean;
  bracketSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: 'rgba(16,20,28,0.45)',
          borderRadius: radius.hud,
          borderWidth: 1,
          borderColor: color.lineSoft,
        },
        padded && { padding: space.md },
        style,
      ]}
    >
      {children}
      <CornerBrackets size={bracketSize} tint={tint} inset={-1} />
    </View>
  );
}

/**
 * Read through getters so a tint picked up at import time cannot outlive the
 * ground it was chosen for. Call sites keep using `hudTint.mesh` unchanged.
 */
export const hudTint = {
  get acid() {
    return color.frameAcid;
  },
  get mesh() {
    return color.frameMesh;
  },
  get dim() {
    return color.frameDim;
  },
  get error() {
    return color.frameError;
  },
  get blue() {
    return color.frameBlue;
  },
};

export { color as hudColor };
