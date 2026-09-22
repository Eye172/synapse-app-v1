import { Canvas, Group, Path, Rect, Skia, type SkPath } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';

import type { SegmentSeverity } from '@/src/technique/evaluator';
import { cameraProjector, type FittedCamera } from '@/src/vision/cameraFit';
import type { TrackedPose } from '@/src/vision/tracker';
import type { Viewport } from '@/src/vision/viewport';

import { buildBody } from './bodyVolumes';
import { buildFacets, OVERLAY_STYLES, type Facet, type OverlayStyle } from './facets';
import { DEFAULT_CAMERA, perspectiveProjector, type Camera } from './volume';

/**
 * The mannequin, drawn over the person it was measured from.
 *
 * The lifter sees themselves, as they would in any camera app, with a solid
 * figure lying on top of them — their own proportions, their own pose, and
 * every part of it separately coloured. When something is wrong, the part
 * that is wrong changes colour, which answers the only question this view
 * exists to answer: not *that* the lift was bad, but *where*.
 *
 * It is drawn filled rather than in outline because outlines cannot hide
 * anything. Unfilled, a far limb's edges show straight through a near one
 * and the figure reads as a tangle of flat lines; filled, near parts cover
 * far ones and the shape reads as a body. The fill is translucent and the
 * background is dimmed underneath it, so the person stays visible through
 * their own model — the point is to compare the two, and an opaque figure
 * would hide the thing it is commenting on.
 *
 * The geometry itself is built in `facets.ts`, which knows nothing about
 * Skia. This file only turns polygons into paths.
 */

export type { OverlayStyle };

export interface BodyOverlayProps {
  pose: TrackedPose | null;
  /**
   * The camera recovered from the frame. With one, the figure lands on the
   * person; without one it is shown from a chosen angle instead, which is
   * what the rig-only view does when there is no picture to land on.
   */
  camera?: FittedCamera | null;
  /** how the camera frame maps onto this canvas */
  viewport?: Viewport;
  /** studio camera, used only when no fitted camera is supplied */
  studio?: Camera;
  severity?: SegmentSeverity;
  width: number;
  height: number;
  style?: OverlayStyle;
  /** 0..1 how far to dim whatever is behind the figure; overrides the style */
  scrim?: number;
  /** dim the whole overlay — paused, or the detector has gone quiet */
  dimmed?: boolean;
}

export function BodyOverlay({
  pose,
  camera = null,
  viewport,
  studio = DEFAULT_CAMERA,
  severity = {},
  width,
  height,
  style = 'solid',
  scrim,
  dimmed = false,
}: BodyOverlayProps) {
  const cfg = OVERLAY_STYLES[style];

  const facets = useMemo<Facet[]>(() => {
    if (!pose || width <= 0 || height <= 0) return [];
    const model = buildBody(pose.world, pose.proportions);
    if (model.solids.length === 0) return [];

    const proj = camera
      ? cameraProjector(camera, viewport)
      : perspectiveProjector(studio, width, height);

    return buildFacets(model.solids, proj, severity, {
      fill: cfg.fill * (dimmed ? 0.55 : 1),
      edge: cfg.edge * (dimmed ? 0.5 : 1),
      lineScale: Math.max(0.75, Math.min(width, height) / 420),
      lightWith: camera ? null : studio,
    });
  }, [pose, camera, viewport, studio, severity, width, height, cfg, dimmed]);

  const paths = useMemo<{ path: SkPath; facet: Facet }[]>(
    () =>
      facets.map((f) => {
        const p = Skia.Path.Make();
        p.moveTo(f.pts[0]!.x, f.pts[0]!.y);
        for (let i = 1; i < f.pts.length; i++) p.lineTo(f.pts[i]!.x, f.pts[i]!.y);
        p.close();
        return { path: p, facet: f };
      }),
    [facets],
  );

  const veil = scrim ?? cfg.scrim;

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      {veil > 0 && paths.length > 0 ? (
        <Rect x={0} y={0} width={width} height={height} color={`rgba(6, 7, 11, ${veil})`} />
      ) : null}
      <Group>
        {paths.map(({ path, facet }, i) => (
          <React.Fragment key={i}>
            {facet.fill ? <Path path={path} style="fill" color={facet.fill} /> : null}
            {facet.stroke ? (
              <Path
                path={path}
                style="stroke"
                strokeWidth={facet.strokeWidth}
                strokeJoin="round"
                color={facet.stroke}
              />
            ) : null}
          </React.Fragment>
        ))}
      </Group>
    </Canvas>
  );
}
