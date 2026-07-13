import { BlurMask, Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { View } from 'react-native';

import { color } from '@/src/theme/tokens';

import { AppText } from './AppText';

/**
 * HUD spark-trend: a glowing polyline over a faint grid — technique score,
 * symmetry or tempo across sessions. Values 0..100, oldest → newest.
 */
export function TrendChart({
  values,
  width,
  height = 64,
  tint = color.acid,
  label,
}: {
  values: number[];
  width: number;
  height?: number;
  tint?: string;
  label?: string;
}) {
  const { path, dots } = useMemo(() => {
    const path = Skia.Path.Make();
    const dots: { x: number; y: number }[] = [];
    if (values.length === 0 || width <= 0) return { path, dots };
    const padX = 6;
    const padY = 8;
    const w = width - padX * 2;
    const h = height - padY * 2;
    const n = values.length;
    const x = (i: number) => padX + (n === 1 ? w / 2 : (i / (n - 1)) * w);
    const y = (v: number) => padY + (1 - Math.max(0, Math.min(100, v)) / 100) * h;
    values.forEach((v, i) => {
      if (i === 0) path.moveTo(x(i), y(v));
      else path.lineTo(x(i), y(v));
      dots.push({ x: x(i), y: y(v) });
    });
    return { path, dots };
  }, [values, width, height]);

  if (values.length === 0) {
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <AppText variant="nano" color={color.textLo}>
          · NO SESSIONS YET ·
        </AppText>
      </View>
    );
  }

  return (
    <Canvas style={{ width, height }}>
      {/* baseline grid */}
      {[0.25, 0.5, 0.75].map((f) => {
        const gy = 8 + (1 - f) * (height - 16);
        const p = Skia.Path.Make();
        p.moveTo(6, gy);
        p.lineTo(width - 6, gy);
        return <Path key={f} path={p} style="stroke" strokeWidth={1} color="rgba(140,160,190,0.10)" />;
      })}
      <Path path={path} style="stroke" strokeWidth={2.4} strokeJoin="round" strokeCap="round" color={tint} opacity={0.5}>
        <BlurMask blur={5} style="solid" />
      </Path>
      <Path path={path} style="stroke" strokeWidth={1.8} strokeJoin="round" strokeCap="round" color={tint} />
      {dots.map((d, i) => (
        <Circle key={i} cx={d.x} cy={d.y} r={i === dots.length - 1 ? 3.4 : 2} color={i === dots.length - 1 ? color.textHi : tint} />
      ))}
    </Canvas>
  );
}
