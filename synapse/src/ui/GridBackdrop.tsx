import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { color } from '@/src/theme/tokens';

/**
 * The void: faint HUD grid + two soft accent pools, behind every dark screen.
 * Pure Views — no canvas. A full-screen GPU surface for a static backdrop
 * would tax the render budget on every screen (§2.14); hairline Views cost
 * nothing after layout.
 */
const STEP = 26;

export function GridBackdrop({ grid = true }: { grid?: boolean }) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  const vLines: number[] = [];
  const hLines: number[] = [];
  if (grid && size.w > 0) {
    for (let x = STEP; x < size.w; x += STEP) vLines.push(x);
    for (let y = STEP; y < size.h; y += STEP) hLines.push(y);
  }

  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: color.void, pointerEvents: 'none', overflow: 'hidden' }]}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {vLines.map((x) => (
        <View key={`v${x}`} style={{ position: 'absolute', left: x, top: 0, bottom: 0, width: 1, backgroundColor: color.gridLine }} />
      ))}
      {hLines.map((y) => (
        <View key={`h${y}`} style={{ position: 'absolute', top: y, left: 0, right: 0, height: 1, backgroundColor: color.gridLine }} />
      ))}
      {size.w > 0 ? (
        <>
          {/* blue pool, top-right */}
          <View
            style={{
              position: 'absolute',
              right: -size.w * 0.55,
              top: -size.w * 0.55,
              width: size.w * 1.1,
              height: size.w * 1.1,
              borderRadius: size.w * 0.55,
              backgroundColor: color.auraBlue,
            }}
          />
          <View
            style={{
              position: 'absolute',
              right: -size.w * 0.3,
              top: -size.w * 0.3,
              width: size.w * 0.6,
              height: size.w * 0.6,
              borderRadius: size.w * 0.3,
              backgroundColor: color.auraBlue,
            }}
          />
          {/* acid pool, bottom-left */}
          <View
            style={{
              position: 'absolute',
              left: -size.w * 0.45,
              bottom: -size.w * 0.45,
              width: size.w * 0.9,
              height: size.w * 0.9,
              borderRadius: size.w * 0.45,
              backgroundColor: color.auraAcid,
            }}
          />
        </>
      ) : null}
    </View>
  );
}
