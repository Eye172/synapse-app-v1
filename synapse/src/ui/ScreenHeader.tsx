import React from 'react';
import { View } from 'react-native';

import { glow } from '@/src/theme/glow';
import { color, space } from '@/src/theme/tokens';

import { AppText } from './AppText';
import { ConnectionChip } from './ConnectionChip';

/** Standard screen header: acid eyebrow dot + mono eyebrow, display title, chip. */
export function ScreenHeader({
  eyebrow,
  title,
  chip = true,
  children,
}: {
  eyebrow: string;
  title: string;
  chip?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: space.gutter, paddingTop: space.sm, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* a flat tick, not a glowing bead — the accent is spent on the
              one thing that matters per screen */}
          <View style={{ width: 10, height: 2, backgroundColor: color.acid }} />
          <AppText variant="nano" color={color.acid}>
            {eyebrow}
          </AppText>
        </View>
        {chip ? <ConnectionChip /> : null}
      </View>
      <AppText variant="h1">{title}</AppText>
      {children}
    </View>
  );
}
