import React from 'react';
import { View } from 'react-native';

export type GlyphName = 'home' | 'library' | 'progress' | 'profile' | 'bolt';

/** Hand-drawn geometric HUD glyphs — no icon font, pure boxes and bars. */
export function TabGlyph({ name, tint, size = 20 }: { name: GlyphName; tint: string; size?: number }) {
  const s = size;
  const b = 1.6;
  const box = { borderColor: tint, borderWidth: b } as const;

  if (name === 'home') {
    return (
      <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'flex-end' }}>
        {/* square body */}
        <View style={[{ width: s * 0.72, height: s * 0.55, borderTopWidth: 0 }, box]} />
        {/* triangle roof */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            width: 0,
            height: 0,
            borderLeftWidth: s * 0.46,
            borderRightWidth: s * 0.46,
            borderBottomWidth: s * 0.4,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: tint,
          }}
        />
        {/* door */}
        <View style={{ position: 'absolute', bottom: 0, width: s * 0.16, height: s * 0.24, backgroundColor: tint }} />
      </View>
    );
  }
  if (name === 'library') {
    const c = s * 0.42;
    return (
      <View style={{ width: s, height: s, flexDirection: 'row', flexWrap: 'wrap', gap: s * 0.12, padding: 0 }}>
        <View style={[{ width: c, height: c }, box]} />
        <View style={[{ width: c, height: c }, box]} />
        <View style={[{ width: c, height: c }, box]} />
        <View style={{ width: c, height: c, backgroundColor: tint }} />
      </View>
    );
  }
  if (name === 'progress') {
    return (
      <View style={{ width: s, height: s, flexDirection: 'row', alignItems: 'flex-end', gap: s * 0.14 }}>
        <View style={{ width: s * 0.2, height: s * 0.38, backgroundColor: `${tint}88` }} />
        <View style={{ width: s * 0.2, height: s * 0.66, backgroundColor: `${tint}BB` }} />
        <View style={{ width: s * 0.2, height: s * 0.95, backgroundColor: tint }} />
      </View>
    );
  }
  if (name === 'profile') {
    return (
      <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'flex-end' }}>
        <View
          style={{
            width: s * 0.4,
            height: s * 0.4,
            borderRadius: s * 0.2,
            borderWidth: b,
            borderColor: tint,
            position: 'absolute',
            top: 0,
          }}
        />
        <View
          style={{
            width: s * 0.85,
            height: s * 0.42,
            borderTopLeftRadius: s * 0.4,
            borderTopRightRadius: s * 0.4,
            borderWidth: b,
            borderBottomWidth: 0,
            borderColor: tint,
          }}
        />
      </View>
    );
  }
  // bolt — the TRAIN glyph: two offset pixel bars, Marathon style
  return (
    <View style={{ width: s, height: s }}>
      <View style={{ position: 'absolute', left: s * 0.18, top: 0, width: s * 0.34, height: s * 0.52, backgroundColor: tint, transform: [{ skewX: '-14deg' }] }} />
      <View style={{ position: 'absolute', right: s * 0.16, bottom: 0, width: s * 0.34, height: s * 0.52, backgroundColor: tint, transform: [{ skewX: '-14deg' }] }} />
    </View>
  );
}
