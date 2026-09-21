import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';

import { meshSeverityColor } from '@/src/theme/tokens';

import { bodyVolumes } from './bodyVolumes';
import type { MeshFrame } from './MeshView';
import {
  DEFAULT_CAMERA,
  facesAway,
  faceDepth,
  painterSort,
  project,
  shade,
  type Camera,
} from './volume';

/**
 * The body as solids rather than sticks (§2.6).
 *
 * The point of the depth is not that it looks better — it is that a fault has
 * a location, and a flat skeleton hides the axis most of them happen on. A
 * knee caving inward, a trunk twisting, a shoulder dropping: all of them are
 * movement toward or away from the camera, and a front-on stick figure shows
 * none of it. Every segment the Rig measures becomes a solid tinted by its
 * own severity, so the answer to "where am I going wrong" is the part of the
 * body that has gone amber.
 *
 * Segments the hardware cannot see are drawn as open frames. There is no
 * sensor below the elbow or the knee, so a solid forearm would assert a
 * position nothing measured — the same rule that makes the metrics say NO
 * DATA rather than guess.
 */



/** Multiply a token colour by a lighting factor, keeping it a valid RN colour. */
function litColor(base: string, k: number, alpha: number): string {
  let r = 0;
  let g = 0;
  let b = 0;
  if (base.startsWith('#')) {
    r = parseInt(base.slice(1, 3), 16);
    g = parseInt(base.slice(3, 5), 16);
    b = parseInt(base.slice(5, 7), 16);
  } else {
    const m = base.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
      r = Number(m[1]);
      g = Number(m[2]);
      b = Number(m[3]);
    }
  }
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgba(${f(r)}, ${f(g)}, ${f(b)}, ${alpha})`;
}

interface DrawFace {
  depth: number;
  fill: string;
  stroke: string | null;
  pts: { x: number; y: number }[];
}

export function MeshView3D({
  frame,
  width,
  height,
  camera = DEFAULT_CAMERA,
  dimmed = false,
}: {
  frame: MeshFrame | null;
  width: number;
  height: number;
  camera?: Camera;
  dimmed?: boolean;
}) {
  const faces = useMemo<DrawFace[]>(() => {
    if (!frame) return [];
    const out: DrawFace[] = [];

    for (const vol of bodyVolumes(frame.landmarks)) {
      const severity = frame.segments[vol.segment] ?? 0;
      const base = meshSeverityColor(severity);
      const faulted = severity >= 0.999;
      for (const q of vol.quads) {
        if (facesAway(q, camera)) continue;
        const projected = q.corners.map((c) => project(c, camera, width, height));
        if (projected.some((p) => !p.visible)) continue;
        const k = shade(q.normal, camera);
        out.push({
          depth: faceDepth(q, camera),
          // an inferred segment is a frame with nothing inside it
          fill: vol.inferred ? 'rgba(0,0,0,0)' : litColor(base, k, dimmed ? 0.45 : 0.92),
          stroke: vol.inferred
            ? litColor(base, 1, 0.35)
            : faulted
              ? litColor(base, 1.25, 1)
              : null,
          pts: projected.map((p) => ({ x: p.x, y: p.y })),
        });
      }
    }

    return painterSort(out);
  }, [frame, width, height, camera, dimmed]);

  const paths = useMemo(
    () =>
      faces.map((f) => {
        const p = Skia.Path.Make();
        p.moveTo(f.pts[0]!.x, f.pts[0]!.y);
        for (let i = 1; i < f.pts.length; i++) p.lineTo(f.pts[i]!.x, f.pts[i]!.y);
        p.close();
        return { path: p, fill: f.fill, stroke: f.stroke };
      }),
    [faces],
  );

  return (
    <Canvas style={{ width, height }}>
      {paths.map((f, i) => (
        <React.Fragment key={i}>
          <Path path={f.path} color={f.fill} />
          {f.stroke ? <Path path={f.path} style="stroke" strokeWidth={1.4} color={f.stroke} /> : null}
        </React.Fragment>
      ))}
    </Canvas>
  );
}
