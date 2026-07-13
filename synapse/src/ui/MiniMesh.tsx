import { BlurMask, Canvas, Circle, Group, Line, vec } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';

import { BONES, NODE_LANDMARKS, neckLine, spineChain } from '@/src/engine/skeleton';
import type { ExerciseSpec, Landmark } from '@/src/engine/types';
import { generatePose } from '@/src/sources/sim/kinematics';
import { color } from '@/src/theme/tokens';

/**
 * Static turquoise mini-skeleton — exercise thumbnails and ghosts in cards.
 * Rendered from the same kinematics that drives the simulator.
 */
export function MiniMesh({
  exercise,
  size = 84,
  cyclePos = 0.32,
  tint = color.mesh,
  glow = true,
  pose,
}: {
  exercise: ExerciseSpec;
  size?: number;
  cyclePos?: number;
  tint?: string;
  glow?: boolean;
  /** custom landmarks override (else generated from the exercise) */
  pose?: Landmark[];
}) {
  const landmarks = useMemo(
    () => pose ?? generatePose(exercise, { cyclePos }),
    [exercise, cyclePos, pose],
  );

  // fit the figure into the canvas with padding
  const { lines, nodes } = useMemo(() => {
    const vis = landmarks.filter((l) => l.v > 0.3);
    const xs = vis.map((l) => l.x);
    const ys = vis.map((l) => l.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(0.12, maxX - minX);
    const spanY = Math.max(0.12, maxY - minY);
    const scale = (size * 0.78) / Math.max(spanX, spanY);
    const ox = (size - spanX * scale) / 2 - minX * scale;
    const oy = (size - spanY * scale) / 2 - minY * scale;
    const px = (l: { x: number; y: number }) => ({ x: l.x * scale + ox, y: l.y * scale + oy });

    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const b of BONES) {
      const a = landmarks[b.a];
      const c = landmarks[b.b];
      if (!a || !c || a.v < 0.3 || c.v < 0.3) continue;
      const pa = px(a);
      const pc = px(c);
      lines.push({ x1: pa.x, y1: pa.y, x2: pc.x, y2: pc.y });
    }
    const neck = neckLine(landmarks);
    if (neck) {
      const pa = px({ x: neck.ax, y: neck.ay });
      const pc = px({ x: neck.bx, y: neck.by });
      lines.push({ x1: pa.x, y1: pa.y, x2: pc.x, y2: pc.y });
    }
    const spine = spineChain(landmarks, 3);
    if (spine) {
      for (let i = 0; i < spine.length - 1; i++) {
        const pa = px(spine[i]!);
        const pc = px(spine[i + 1]!);
        lines.push({ x1: pa.x, y1: pa.y, x2: pc.x, y2: pc.y });
      }
    }
    const nodes = NODE_LANDMARKS.map((n) => {
      const l = landmarks[n.lm];
      if (!l || l.v < 0.3) return null;
      const p = px(l);
      return { x: p.x, y: p.y, r: Math.max(1.6, (n.r / 10) * size * 0.035) };
    }).filter((n): n is { x: number; y: number; r: number } => n !== null);
    return { lines, nodes };
  }, [landmarks, size]);

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group>
        {glow && (
          <Group opacity={0.55}>
            {lines.map((l, i) => (
              <Line key={`g${i}`} p1={vec(l.x1, l.y1)} p2={vec(l.x2, l.y2)} color={tint} strokeWidth={2.4}>
                <BlurMask blur={4} style="solid" />
              </Line>
            ))}
          </Group>
        )}
        {lines.map((l, i) => (
          <Line key={i} p1={vec(l.x1, l.y1)} p2={vec(l.x2, l.y2)} color={tint} strokeWidth={1.4} />
        ))}
        {nodes.map((n, i) => (
          <Circle key={`n${i}`} cx={n.x} cy={n.y} r={n.r} color={tint} />
        ))}
      </Group>
    </Canvas>
  );
}
