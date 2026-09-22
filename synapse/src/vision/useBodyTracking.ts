import { useEffect, useMemo, useRef, useState } from 'react';

import type { PoseFrame } from '@/src/engine/types';

import { fitCamera, type FittedCamera } from './cameraFit';
import { PoseTracker, type TrackedPose } from './tracker';
import { coverViewport, type Viewport } from './viewport';

/**
 * The whole camera path, in one place.
 *
 * Pose frames arrive from the detector at whatever rate the phone manages.
 * They are smoothed and held to the wearer's own bone lengths, a camera is
 * recovered from each so the figure can be put back where the lens saw it,
 * and the result is resampled for the instant the screen is actually
 * drawing — which is never the instant a frame arrived.
 *
 * Keeping it here rather than in the live screen matters for one reason:
 * the tracker has memory. A component that rebuilt it on re-render would
 * throw away the body it had measured every time a rep counter ticked, and
 * the figure would visibly resize mid-set.
 */

export interface BodyTracking {
  /** the body as of the last redraw, or null before anyone has been seen */
  pose: TrackedPose | null;
  /** the camera recovered from the frame, or null when it could not be */
  camera: FittedCamera | null;
  /** how the camera frame maps onto the screen */
  viewport: Viewport | null;
  /** true when the figure can be placed on the person rather than posed */
  aligned: boolean;
}

export interface BodyTrackingOptions {
  /** screen size the overlay is drawn at */
  width: number;
  height: number;
  /** true when the preview is mirrored, as a front camera usually is */
  mirrored?: boolean;
  /** redraws per second; the detector runs slower and is interpolated */
  fps?: number;
  /** stop advancing while the set is paused */
  paused?: boolean;
}

/**
 * A reprojection error past this many pixels means the camera solve did not
 * explain the frame, and a figure drawn from it would sit confidently in
 * the wrong place. Scaled by frame size, since a miss of ten pixels means
 * something different on a thumbnail and on a 4K frame.
 */
const RESIDUAL_LIMIT = 0.06;

export function useBodyTracking(
  subscribe: (cb: (f: PoseFrame) => void) => () => void,
  opts: BodyTrackingOptions,
): BodyTracking {
  const { width, height, mirrored = false, fps = 60, paused = false } = opts;
  const tracker = useRef<PoseTracker | null>(null);
  if (tracker.current === null) tracker.current = new PoseTracker();

  const camera = useRef<FittedCamera | null>(null);
  const [tick, setTick] = useState(0);

  // --- take in detections -------------------------------------------------
  useEffect(() => {
    const unsubscribe = subscribe((f) => {
      const tr = tracker.current;
      if (!tr) return;
      // a pose without metric points cannot be placed on the person; it can
      // still be drawn from a chosen angle, which is what the rig path does
      if (!f.world || !f.frame) return;
      tr.update({ t: f.t, image: f.landmarks, world: f.world, frame: f.frame });
      const posed = tr.sample(f.t);
      if (!posed) return;
      const fit = fitCamera(posed.world, posed.image, f.frame);
      if (fit && fit.residual <= RESIDUAL_LIMIT * Math.min(f.frame.width, f.frame.height)) {
        camera.current = fit;
      }
    });
    return unsubscribe;
  }, [subscribe]);

  // --- drive the redraw ---------------------------------------------------
  useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), Math.max(8, 1000 / fps));
    return () => clearInterval(id);
  }, [fps, paused]);

  const pose = useMemo(() => {
    void tick;
    // asking for *now* rather than for the last detection is what keeps the
    // figure on a moving lifter between frames
    return tracker.current?.sample(Date.now()) ?? null;
  }, [tick]);

  const viewport = useMemo(() => {
    const f = tracker.current?.frame;
    if (!f || f.width <= 0 || width <= 0) return null;
    return coverViewport(f, { width, height }, mirrored);
  }, [width, height, mirrored, tick]);

  const cam = camera.current;
  return {
    pose,
    camera: cam,
    viewport,
    aligned: cam !== null && pose !== null && pose.coverage > 0.2,
  };
}
