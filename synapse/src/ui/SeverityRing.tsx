import { BlurMask, Canvas, Path, Skia } from '@shopify/react-native-skia';
import React from 'react';
import { View } from 'react-native';

import { color } from '@/src/theme/tokens';

import { AppText } from './AppText';

/**
 * Graded score ring (report / safety score). Color follows the score:
 * acid for good, warn, then error — red only when the body is at risk.
 */
export function SeverityRing({
  score,
  size = 132,
  label,
  showValue = true,
  tintOverride,
}: {
  /** 0..100, or null for the no-data state */
  score: number | null;
  size?: number;
  label?: string;
  showValue?: boolean;
  tintOverride?: string;
}) {
  const stroke = Math.max(6, size * 0.065);
  const r = (size - stroke) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;

  const sweep = score === null ? 0 : (Math.max(0, Math.min(100, score)) / 100) * 360;
  const tint =
    tintOverride ?? (score === null ? color.textLo : score >= 75 ? color.acid : score >= 50 ? color.warn : color.error);

  const track = Skia.Path.Make();
  track.addCircle(cx, cy, r);
  const arc = Skia.Path.Make();
  arc.addArc({ x: cx - r, y: cy - r, width: r * 2, height: r * 2 }, -90, sweep);

  return (
    <View style={{ width: size, height: size }} accessibilityLabel={label ? `${label}: ${score ?? 'no data'}` : undefined}>
      <Canvas style={{ width: size, height: size }}>
        <Path path={track} style="stroke" strokeWidth={stroke} color="rgba(255,255,255,0.08)" />
        {sweep > 0 && (
          <>
            <Path path={arc} style="stroke" strokeWidth={stroke} strokeCap="round" color={tint} opacity={0.5}>
              <BlurMask blur={7} style="solid" />
            </Path>
            <Path path={arc} style="stroke" strokeWidth={stroke} strokeCap="round" color={tint} />
          </>
        )}
      </Canvas>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        {showValue ? (
          <AppText
            variant="display"
            color={score === null ? color.textLo : tint}
            style={{ fontSize: size * 0.27, lineHeight: size * 0.3 }}
          >
            {score === null ? '—' : Math.round(score)}
          </AppText>
        ) : null}
        {label ? (
          <AppText variant="nano" style={{ marginTop: 2 }}>
            {label}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
