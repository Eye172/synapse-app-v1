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
          borderColor: 'rgba(255,255,255,0.05)',
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

export const hudTint = {
  acid: 'rgba(200,240,60,0.55)',
  mesh: 'rgba(33,240,220,0.5)',
  dim: 'rgba(153,162,174,0.3)',
  error: 'rgba(255,59,92,0.6)',
  blue: 'rgba(46,107,255,0.55)',
};

export { color as hudColor };
