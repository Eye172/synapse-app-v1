import React, { useMemo } from 'react';

import type { SegmentSeverity } from '@/src/technique/evaluator';
import { BodyMeasure } from '@/src/vision/proportions';
import type { TrackedPose } from '@/src/vision/tracker';

import { BodyOverlay, type OverlayStyle } from './BodyOverlay';
import { worldFromLandmarks } from './bodyVolumes';
import type { MeshFrame } from './MeshView';
import { DEFAULT_CAMERA, type Camera } from './volume';

/**
 * The rig's own view of the body, with no photograph to lie on.
 *
 * When five IMUs are drawing the figure there is no camera frame and
 * nothing to land on, so the mannequin is shown from a chosen angle
 * instead — a slight three-quarter turn, because straight on hides exactly
 * the depth this view exists to show and a hard profile hides left/right
 * asymmetry.
 *
 * Everything past the projection is shared with the camera overlay: same
 * solids, same shading, same depth ordering. The only difference between
 * "put the body back where the lens saw it" and "show me the body from an
 * angle" is which camera gets handed in.
 */
export function MeshView3D({
  frame,
  width,
  height,
  camera = DEFAULT_CAMERA,
  dimmed = false,
  style = 'solid',
}: {
  frame: MeshFrame | null;
  width: number;
  height: number;
  camera?: Camera;
  dimmed?: boolean;
  style?: OverlayStyle;
}) {
  const pose = useMemo<TrackedPose | null>(() => {
    if (!frame) return null;
    // the rig knows angles, not centimetres, so the figure is scaled to a
    // nominal body and then measured back out of itself — which keeps every
    // thickness downstream a function of measurements rather than constants
    const world = worldFromLandmarks(frame.landmarks);
    const measure = new BodyMeasure();
    measure.observe(world);
    return {
      t: 0,
      image: frame.landmarks,
      world,
      proportions: measure.proportions,
      speed: 0,
      coverage: 1,
      age: 0,
    };
  }, [frame]);

  return (
    <BodyOverlay
      pose={pose}
      studio={camera}
      severity={frame?.segments as SegmentSeverity}
      width={width}
      height={height}
      style={style}
      // there is no photograph behind this one, so nothing to dim
      scrim={0}
      dimmed={dimmed}
    />
  );
}
