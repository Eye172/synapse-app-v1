import React from 'react';
import { StyleSheet, View } from 'react-native';

import { color } from '@/src/theme/tokens';

/** The HUD signature: thin corner brackets framing live/technical panels. */
export function CornerBrackets({
  size = 18,
  thickness = 1.5,
  tint = 'rgba(200,240,60,0.55)',
  inset = 0,
}: {
  size?: number;
  thickness?: number;
  tint?: string;
  inset?: number;
}) {
  const base = {
    position: 'absolute' as const,
    width: size,
    height: size,
    borderColor: tint,
  };
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <View style={[base, { top: inset, left: inset, borderTopWidth: thickness, borderLeftWidth: thickness }]} />
      <View style={[base, { top: inset, right: inset, borderTopWidth: thickness, borderRightWidth: thickness }]} />
      <View style={[base, { bottom: inset, left: inset, borderBottomWidth: thickness, borderLeftWidth: thickness }]} />
      <View style={[base, { bottom: inset, right: inset, borderBottomWidth: thickness, borderRightWidth: thickness }]} />
    </View>
  );
}

/** Same reasoning as hudTint — resolved on read, not on import. */
export const bracketTint = {
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
    return color.error;
  },
};
