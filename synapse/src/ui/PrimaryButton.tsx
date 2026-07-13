import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { glow } from '@/src/theme/glow';
import { color, radius, space } from '@/src/theme/tokens';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

/**
 * The acid CTA — the app talking to you. One per screen, maximum.
 */
export function PrimaryButton({
  title,
  sub,
  onPress,
  disabled,
  danger,
  compact,
  style,
  accessibilityLabel,
}: {
  title: string;
  sub?: string;
  onPress?: () => void;
  disabled?: boolean;
  /** the red variant is reserved for STOP-class actions only */
  danger?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const bg = danger ? color.error : color.acid;
  const ink = danger ? color.inkOnError : color.inkOnAcid;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={style}
    >
      <View
        style={[
          {
            backgroundColor: disabled ? color.surface1 : bg,
            borderRadius: radius.hud + 4,
            paddingVertical: compact ? 12 : 16,
            paddingHorizontal: space.lg,
            alignItems: 'center',
          },
          disabled ? null : glow(bg, 18, 0.55, 6),
        ]}
      >
        <AppText
          variant="h3"
          color={disabled ? color.textLo : ink}
          style={{ fontFamily: 'ChakraPetch_700Bold', textTransform: 'uppercase', letterSpacing: 1.2 }}
        >
          {title}
        </AppText>
        {sub ? (
          <AppText variant="nano" color={disabled ? color.textLo : `${ink}CC`} style={{ marginTop: 2 }}>
            {sub}
          </AppText>
        ) : null}
      </View>
    </PressableScale>
  );
}
