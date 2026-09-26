import React, { useEffect, useMemo, useState } from 'react';

import type { SegmentSeverity } from '@/src/technique/evaluator';
import type { TrackedPose } from '@/src/vision/tracker';
import { isPlaced, type BodyTracker } from '@/src/vision/useBodyTracking';
import { coverViewport } from '@/src/vision/viewport';

import { BodyOverlay, type OverlayStyle } from './BodyOverlay';

/**
 * The lifter's 3D body, redrawn every screen frame on their own picture.
 *
 * This is the one component on the set screens that re-renders at display
 * rate: each animation frame it asks the tracker for the body *now* (the
 * detector runs slower, and the tracker predicts forward between its
 * frames) and draws it through the solved camera. Nothing is drawn until the
 * camera has placed the figure on the person — a body that is not standing
 * on the lifter would be a body made up.
 *
 * Sized and positioned like the camera preview beneath it (full screen, from
 * the same origin), so the crop-and-mirror viewport maps the frame onto both
 * identically.
 */
export function LiveBody({
  tracker,
  width,
  height,
  mirrored,
  severity,
  style,
  paused = false,
}: {
  tracker: BodyTracker;
  width: number;
  height: number;
  /** the preview is mirrored, as it is from the front camera */
  mirrored: boolean;
  severity?: SegmentSeverity;
  style?: OverlayStyle;
  /** hold the last pose, dimmed */
  paused?: boolean;
}) {
  const [pose, setPose] = useState<TrackedPose | null>(null);

  useEffect(() => {
    if (paused) return undefined;
    let alive = true;
    let id = 0;
    const loop = () => {
      if (!alive) return;
      setPose(tracker.sample(Date.now()));
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, [tracker, paused]);

  const frame = tracker.frame();
  const fw = frame?.width ?? 0;
  const fh = frame?.height ?? 0;
  const viewport = useMemo(
    () => (fw > 0 && fh > 0 ? coverViewport({ width: fw, height: fh }, { width, height }, mirrored) : null),
    [fw, fh, width, height, mirrored],
  );

  const camera = tracker.camera();
  if (!pose || !camera || !viewport || !isPlaced(pose, camera)) return null;
  return (
    <BodyOverlay
      pose={pose}
      camera={camera}
      viewport={viewport}
      severity={severity}
      width={width}
      height={height}
      style={style}
      dimmed={paused}
    />
  );
}
