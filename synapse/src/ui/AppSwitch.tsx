import React from 'react';
import { Platform, Switch } from 'react-native';

import { color } from '@/src/theme/tokens';

/** Themed switch — react-native-web needs activeThumbColor for the on-state. */
export function AppSwitch({
  value,
  onValueChange,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  accessibilityLabel?: string;
}) {
  const webProps =
    Platform.OS === 'web' ? ({ activeThumbColor: color.acid } as Record<string, unknown>) : {};
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ false: 'rgba(255,255,255,0.12)', true: 'rgba(200,240,60,0.5)' }}
      thumbColor={value ? color.acid : color.textLo}
      {...webProps}
    />
  );
}
