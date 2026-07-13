import { BlurMask, Canvas, Circle, Group, Line, vec } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';

import { BONES, NODE_LANDMARKS, neckLine, spineChain } from '@/src/engine/skeleton';
import type { Landmark, SegmentId } from '@/src/engine/types';
import { color, meshSeverityColor } from '@/src/theme/tokens';

export interface MeshFrame {
  landmarks: Landmark[];
  segments: Partial<Record<SegmentId, number>>;
  /** frame time, drives the node pulse */
  t: number;
}

const VIS = 0.3;

/**
 * The Mesh (§2.6): turquoise glowing skeleton, each bone/node tinted by its
 * segment's continuous severity. Optionally renders the acid "target pose"
 * ghost beneath (§2.5 GET_INTO_POSITION).
 */
export function MeshView({
  frame,
  ghost,
  width,
  height,
  ghostOpacity = 0.4,
  dimmed = false,
}: {
  frame: MeshFrame | null;
  ghost?: Landmark[] | null;
  width: number;
  height: number;
  ghostOpacity?: number;
  dimmed?: boolean;
}) {
  const px = (l: { x: number; y: number }) => ({ x: l.x * width, y: l.y * height });

  const ghostShapes = useMemo(() => {
    if (!ghost) return null;
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const b of BONES) {
      const a = ghost[b.a];
      const c = ghost[b.b];
      if (!a || !c || a.v < VIS || c.v < VIS) continue;
      const pa = px(a);
      const pc = px(c);
      lines.push({ x1: pa.x, y1: pa.y, x2: pc.x, y2: pc.y });
    }
    const neck = neckLine(ghost);
    if (neck) {
      const pa = px({ x: neck.ax, y: neck.ay });
      const pc = px({ x: neck.bx, y: neck.by });
      lines.push({ x1: pa.x, y1: pa.y, x2: pc.x, y2: pc.y });
    }
    const dots = NODE_LANDMARKS.map((n) => {
      const l = ghost[n.lm];
      if (!l || l.v < VIS) return null;
      const p = px(l);
      return { x: p.x, y: p.y, r: (n.r / 10) * Math.min(width, height) * 0.02 };
    }).filter((d): d is { x: number; y: number; r: number } => d !== null);
    return { lines, dots };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghost, width, height]);

  const live = useMemo(() => {
    if (!frame) return null;
    const { landmarks, segments, t } = frame;
    const pulse = 1 + 0.09 * Math.sin(((t % 1200) / 1200) * Math.PI * 2); // 1.2s node pulse

    const bones = BONES.map((b) => {
      const a = landmarks[b.a];
      const c = landmarks[b.b];
      if (!a || !c || a.v < VIS || c.v < VIS) return null;
      const pa = px(a);
      const pc = px(c);
      return {
        x1: pa.x,
        y1: pa.y,
        x2: pc.x,
        y2: pc.y,
        color: meshSeverityColor(segments[b.segment] ?? 0),
        sev: segments[b.segment] ?? 0,
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    const neck = neckLine(landmarks);
    if (neck) {
      const pa = px({ x: neck.ax, y: neck.ay });
      const pc = px({ x: neck.bx, y: neck.by });
      const sev = Math.max(segments.neck ?? 0, segments.head ?? 0);
      bones.push({ x1: pa.x, y1: pa.y, x2: pc.x, y2: pc.y, color: meshSeverityColor(sev), sev });
    }

    // the backbone — segmented, with vertebra dots, tinted by spine severity
    const spinePts = spineChain(landmarks);
    const vertebrae: { x: number; y: number; r: number; color: string }[] = [];
    if (spinePts) {
      const sev = Math.max(segments.torso ?? 0, segments.neck ?? 0);
      const tint = meshSeverityColor(sev);
      for (let i = 0; i < spinePts.length - 1; i++) {
        const a = px(spinePts[i]!);
        const b = px(spinePts[i + 1]!);
        bones.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: tint, sev });
      }
      const vr = Math.min(width, height) * 0.008;
      for (let i = 1; i < spinePts.length - 1; i++) {
        const p = px(spinePts[i]!);
        vertebrae.push({ x: p.x, y: p.y, r: vr, color: tint });
      }
    }

    const nodes = NODE_LANDMARKS.map((n) => {
      const l = landmarks[n.lm];
      if (!l || l.v < VIS) return null;
      const p = px(l);
      const sev = Math.max(0, ...n.segments.map((s) => segments[s] ?? 0));
      const base = (n.r / 10) * Math.min(width, height) * 0.028;
      return { x: p.x, y: p.y, r: base * pulse, color: meshSeverityColor(sev), sev };
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    return { bones, nodes, vertebrae };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, width, height]);

  return (
    <Canvas style={{ width, height, pointerEvents: 'none' }}>
      {ghostShapes && (
        <Group opacity={ghostOpacity}>
          {ghostShapes.lines.map((l, i) => (
            <Line key={`gl${i}`} p1={vec(l.x1, l.y1)} p2={vec(l.x2, l.y2)} color={color.acid} strokeWidth={2} />
          ))}
          {ghostShapes.dots.map((d, i) => (
            <Circle key={`gd${i}`} cx={d.x} cy={d.y} r={d.r} color={color.acid} />
          ))}
        </Group>
      )}

      {live && (
        <Group opacity={dimmed ? 0.45 : 1}>
          {/* glow pass */}
          <Group opacity={0.5}>
            {live.bones.map((b, i) => (
              <Line key={`bg${i}`} p1={vec(b.x1, b.y1)} p2={vec(b.x2, b.y2)} color={b.color} strokeWidth={b.sev >= 1 ? 7 : 5}>
                <BlurMask blur={b.sev >= 1 ? 12 : 8} style="solid" />
              </Line>
            ))}
          </Group>
          {/* core bones */}
          {live.bones.map((b, i) => (
            <Line key={`b${i}`} p1={vec(b.x1, b.y1)} p2={vec(b.x2, b.y2)} color={b.color} strokeWidth={2.4} />
          ))}
          {/* node glow + cores */}
          <Group opacity={0.55}>
            {live.nodes.map((n, i) => (
              <Circle key={`ng${i}`} cx={n.x} cy={n.y} r={n.r * 2.1} color={n.color}>
                <BlurMask blur={10} style="normal" />
              </Circle>
            ))}
          </Group>
          {live.nodes.map((n, i) => (
            <Circle key={`n${i}`} cx={n.x} cy={n.y} r={n.r} color={n.color} />
          ))}
          {live.vertebrae.map((v, i) => (
            <Circle key={`v${i}`} cx={v.x} cy={v.y} r={v.r} color={v.color} />
          ))}
        </Group>
      )}
    </Canvas>
  );
}
