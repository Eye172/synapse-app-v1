import { Canvas, PaintStyle, Picture, Skia, StrokeJoin, type SkPicture } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';

import type { SegmentSeverity } from '@/src/technique/evaluator';
import { cameraProjector, type FittedCamera } from '@/src/vision/cameraFit';
import type { TrackedPose } from '@/src/vision/tracker';
import type { Viewport } from '@/src/vision/viewport';

import { buildBody } from './bodyVolumes';
import { buildFacets, OVERLAY_STYLES, type Facet, type OverlayStyle } from './facets';

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
 * far ones and the shape reads as a body. The fill is translucent, so the
 * person stays visible through their own model.
 *
 * The geometry is built in `facets.ts`, which knows nothing about Skia — the
 * `live/` browser page traces the very same facet list onto a 2D canvas.
 * This file only records the facets into one Skia picture per frame: one
 * native draw call, rather than a React element per polygon that React
 * would have to reconcile sixty times a second.
 */

export type { OverlayStyle };

export interface BodyOverlayProps {
  pose: TrackedPose;
  /** the camera recovered from the frame; the figure is projected through it */
  camera: FittedCamera;
  /** how the camera frame maps onto this canvas (crop and mirror) */
  viewport: Viewport;
  severity?: SegmentSeverity;
  width: number;
  height: number;
  style?: OverlayStyle;
  /** dim the whole overlay — the set is paused */
  dimmed?: boolean;
}

const NO_SEVERITY: SegmentSeverity = {};

export function BodyOverlay({
  pose,
  camera,
  viewport,
  severity = NO_SEVERITY,
  width,
  height,
  style = 'solid',
  dimmed = false,
}: BodyOverlayProps) {
  const cfg = OVERLAY_STYLES[style];

  const facets = useMemo<Facet[]>(() => {
    if (width <= 0 || height <= 0) return [];
    const model = buildBody(pose.world, pose.proportions);
    if (model.solids.length === 0) return [];
    return buildFacets(model.solids, cameraProjector(camera, viewport), severity, {
      fill: cfg.fill * (dimmed ? 0.55 : 1),
      edge: cfg.edge * (dimmed ? 0.5 : 1),
      lineScale: Math.max(0.75, Math.min(width, height) / 420),
      lightWith: null,
    });
  }, [pose, camera, viewport, severity, width, height, cfg, dimmed]);

  const picture = useMemo<SkPicture | null>(
    () => (facets.length > 0 ? record(facets, width, height, cfg.scrim) : null),
    [facets, width, height, cfg.scrim],
  );

  if (picture === null) return null;
  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Picture picture={picture} />
    </Canvas>
  );
}

/** Trace the facets, far to near, into one picture. */
function record(facets: Facet[], width: number, height: number, scrim: number): SkPicture {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));

  // a light veil behind the figure keeps its colours readable over any gym
  if (scrim > 0) {
    const veil = Skia.Paint();
    veil.setColor(Skia.Color(`rgba(6, 7, 11, ${scrim})`));
    canvas.drawRect(Skia.XYWHRect(0, 0, width, height), veil);
  }

  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setStyle(PaintStyle.Fill);
  const edge = Skia.Paint();
  edge.setAntiAlias(true);
  edge.setStyle(PaintStyle.Stroke);
  edge.setStrokeJoin(StrokeJoin.Round);

  for (const f of facets) {
    const path = Skia.Path.Make();
    path.moveTo(f.pts[0]!.x, f.pts[0]!.y);
    for (let i = 1; i < f.pts.length; i++) path.lineTo(f.pts[i]!.x, f.pts[i]!.y);
    path.close();
    if (f.fill) {
      fill.setColor(Skia.Color(f.fill));
      canvas.drawPath(path, fill);
    }
    if (f.stroke) {
      edge.setColor(Skia.Color(f.stroke));
      edge.setStrokeWidth(f.strokeWidth);
      canvas.drawPath(path, edge);
    }
  }
  return recorder.finishRecordingAsPicture();
}
