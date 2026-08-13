import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { color, space } from '@/src/theme/tokens';

import { AppText } from './AppText';

/**
 * Grouping by typography and a hairline instead of yet another card. Boxing
 * every block in the same rounded panel flattens hierarchy — a rule and some
 * air separate content without making everything look equally important.
 *
 * The label sits one step brighter than captions and asides. When headings,
 * captions and passing notes all share the dimmest grey there is nothing to
 * scan by, and a screen reads as an undifferentiated wall however well it is
 * structured underneath.
 */
export function Section({
  label,
  aside,
  children,
  first = false,
  style,
}: {
  label?: string;
  /** right-aligned counterpart to the label — a count, a state, a unit */
  aside?: React.ReactNode;
  children?: React.ReactNode;
  /** the first section on a screen skips the top rule */
  first?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ paddingHorizontal: space.gutter }, style]}>
      {!first ? (
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: space.md }} />
      ) : null}
      {label ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: space.sm,
          }}
        >
          <AppText variant="nano" color={color.textMid}>
            {label}
          </AppText>
          {aside}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/**
 * An instrument reading: the number carries the weight, the unit and caption
 * stay out of its way.
 */
export function Metric({
  value,
  unit,
  caption,
  tint = color.textHi,
  size = 40,
}: {
  value: string;
  unit?: string;
  caption?: string;
  tint?: string;
  size?: number;
}) {
  return (
    <View accessibilityLabel={caption ? `${caption}: ${value}${unit ?? ''}` : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <AppText variant="display" color={tint} style={{ fontSize: size, lineHeight: size * 1.02 }}>
          {value}
        </AppText>
        {unit ? (
          <AppText variant="nano" color={color.textMid}>
            {unit}
          </AppText>
        ) : null}
      </View>
      {caption ? (
        <AppText variant="nano" color={color.textLo} style={{ marginTop: 3 }}>
          {caption}
        </AppText>
      ) : null}
    </View>
  );
}

/** A thin proportional bar — the honest way to show a 0..1 quantity inline. */
export function Bar({
  fill,
  tint = color.acid,
  height = 2,
  track = 'rgba(255,255,255,0.10)',
}: {
  fill: number;
  tint?: string;
  height?: number;
  track?: string;
}) {
  return (
    <View style={{ height, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%`, height, backgroundColor: tint }} />
    </View>
  );
}
