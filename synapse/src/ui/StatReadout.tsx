import React from 'react';
import { View } from 'react-native';

import { color } from '@/src/theme/tokens';

import { AppText } from './AppText';

/**
 * Cockpit stat: mono key, big tabular value, thin fill bar — the data-rail
 * unit from the mockup.
 */
export function StatReadout({
  k,
  v,
  unit,
  tint = color.textHi,
  fill,
  width = 64,
}: {
  k: string;
  v: string;
  unit?: string;
  tint?: string;
  /** 0..1 bar fill; omit to hide the bar */
  fill?: number;
  width?: number;
}) {
  return (
    <View accessibilityLabel={`${k}: ${v}${unit ?? ''}`}>
      <AppText variant="nano" color={color.textLo}>
        {k}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
        <AppText variant="monoValue" color={tint}>
          {v}
        </AppText>
        {unit ? (
          <AppText variant="nano" color={color.textMid} style={{ marginBottom: 3 }}>
            {unit}
          </AppText>
        ) : null}
      </View>
      {fill !== undefined ? (
        <View
          style={{
            width,
            height: 3,
            borderRadius: 2,
            backgroundColor: color.line,
            marginTop: 4,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: Math.max(0, Math.min(1, fill)) * width,
              height: 3,
              borderRadius: 2,
              backgroundColor: tint,
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
