import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius } from '@/src/theme/tokens';

import { AppText } from './AppText';

/** Small mono chip — categories, statuses, risk badges. */
export function Chip({
  label,
  tint = color.textMid,
  filled = false,
  outlined = true,
  dot = false,
  style,
}: {
  label: string;
  tint?: string;
  filled?: boolean;
  outlined?: boolean;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 8,
          paddingVertical: 3.5,
          borderRadius: radius.hudSm,
          borderWidth: outlined ? 1 : 0,
          borderColor: filled ? 'transparent' : `${tint}66`,
          backgroundColor: filled ? tint : `${tint}14`,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      {dot ? (
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: filled ? color.void : tint }} />
      ) : null}
      <AppText variant="nano" color={filled ? color.void : tint}>
        {label}
      </AppText>
    </View>
  );
}

/** Risk badge per §2.4 — risk-3 lifts get the red outline. Red stays semantic: it marks danger to the body. */
export function RiskBadge({ level }: { level: 1 | 2 | 3 }) {
  const tint = level >= 3 ? color.error : level === 2 ? color.warn : color.textMid;
  return <Chip label={`RISK ${level}`} tint={tint} dot={level >= 3} />;
}
