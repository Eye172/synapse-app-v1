import { useEffect, useRef, useState } from 'react';

import type { Landmark, PoseFrame } from '@/src/engine/types';

import { fitCamera, type FittedCamera } from './cameraFit';
import { PoseTracker, type TrackedPose } from './tracker';
import type { FrameSize } from './types';

/**
 * The camera path, from detections to a body that can be drawn.
 *
 * Pose frames arrive from the detector at whatever rate the device manages
 * (about 15 a second). Each one is smoothed and held to the lifter's own
 * bone lengths by the tracker, and a camera is recovered from it so the
 * figure can be put back where the lens saw it. The renderer then asks for
 * the body *at the instant it is drawing* — never the instant a frame
 * arrived — which is what keeps the figure on a moving lifter between
 * detections.
 *
 * Two consumers, two rates, and they are kept apart on purpose:
 *  - the figure itself redraws every screen frame, inside `LiveBody`, which
 *    is the only component that re-renders that often;
 *  - everything else on the screen (status strip, framing checks, readouts)
 *    reads `status`, which changes a few times a second.
 * A screen that re-rendered its whole HUD sixty times a second to move the
 * figure would spend the phone's time drawing text nobody reads that fast.
 *
 * The tracker has memory — it holds the body it has measured — so it lives
 * in a ref for the life of the screen and is never rebuilt on re-render.
 */

/** Everything the renderer needs, read on demand for the instant it draws. */
export interface BodyTracker {
  /** the body at wall-clock time `t` (ms), predicted forward from the last detection */
  sample(t: number): TrackedPose | null;
  /** the camera recovered from the latest frame it could be solved for */
  camera(): FittedCamera | null;
  /** the size of the frames the detector is looking at */
  frame(): FrameSize | null;
}

/** What the rest of the screen needs to know, a few times a second. */
export interface TrackingStatus {
  /** the figure is standing on the lifter: a camera is solved and the body is seen */
  placed: boolean;
  /** the smoothed image-space landmarks (normalized to the frame), or null before anyone is seen */
  image: Landmark[] | null;
  frame: FrameSize | null;
  /** 0..1 share of the body the detector currently sees */
  coverage: number;
  /** lens to hips, metres, from the camera solve */
  distance: number | null;
  /** the lifter's measured height, metres */
  height: number | null;
  /** 0..1 how sure the body measurement is */
  confidence: number;
  /** how far the solved camera misses the detected joints, frame pixels */
  residual: number | null;
}

export const NO_TRACKING: TrackingStatus = {
  placed: false,
  image: null,
  frame: null,
  coverage: 0,
  distance: null,
  height: null,
  confidence: 0,
  residual: null,
};

/**
 * A reprojection error past this share of the frame's short side means the
 * camera solve did not explain the frame, and a figure drawn from it would
 * sit confidently in the wrong place. Scaled by frame size, since a miss of
 * ten pixels means something different on a thumbnail and on a 4K frame.
 */
const RESIDUAL_LIMIT = 0.06;

/**
 * Below this share of the body seen, the figure is not drawn: a mannequin
 * hung on three joints is mostly guesswork.
 */
const MIN_COVERAGE = 0.2;

/** How often `status` is refreshed for the rest of the screen. */
const STATUS_PERIOD_MS = 200;

/** One rule for "the figure may be drawn on the person", used everywhere. */
export function isPlaced(pose: TrackedPose | null, camera: FittedCamera | null): boolean {
  return camera !== null && pose !== null && pose.coverage > MIN_COVERAGE;
}

export function useBodyTracking(
  subscribe: (cb: (f: PoseFrame) => void) => () => void,
): { tracker: BodyTracker; status: TrackingStatus } {
  const trackerRef = useRef<PoseTracker | null>(null);
  if (trackerRef.current === null) trackerRef.current = new PoseTracker();
  const cameraRef = useRef<FittedCamera | null>(null);

  const handle = useRef<BodyTracker | null>(null);
  if (handle.current === null) {
    handle.current = {
      sample: (t) => trackerRef.current?.sample(t) ?? null,
      camera: () => cameraRef.current,
      frame: () => trackerRef.current?.frame ?? null,
    };
  }

  // --- take in detections -------------------------------------------------
  useEffect(() => {
    return subscribe((f) => {
      const tr = trackerRef.current;
      // a pose without metric points cannot be measured or placed
      if (!tr || !f.world || !f.frame) return;
      tr.update({ t: f.t, image: f.landmarks, world: f.world, frame: f.frame });
      const posed = tr.sample(f.t);
      if (!posed) return;
      const fit = fitCamera(posed.world, posed.image, f.frame);
      if (fit && fit.residual <= RESIDUAL_LIMIT * Math.min(f.frame.width, f.frame.height)) {
        cameraRef.current = fit;
      }
    });
  }, [subscribe]);

  // --- the slow lane: what the rest of the screen reads -------------------
  const [status, setStatus] = useState<TrackingStatus>(NO_TRACKING);
  useEffect(() => {
    const id = setInterval(() => {
      const pose = trackerRef.current?.sample(Date.now()) ?? null;
      const cam = cameraRef.current;
      const next: TrackingStatus = pose
        ? {
            placed: isPlaced(pose, cam),
            image: pose.image,
            frame: trackerRef.current?.frame ?? null,
            coverage: pose.coverage,
            distance: cam?.distance ?? null,
            height: pose.proportions.confidence > 0 ? pose.proportions.height : null,
            confidence: pose.proportions.confidence,
            residual: cam?.residual ?? null,
          }
        : NO_TRACKING;
      setStatus((prev) => (prev === NO_TRACKING && next === NO_TRACKING ? prev : next));
    }, STATUS_PERIOD_MS);
    return () => clearInterval(id);
  }, []);

  return { tracker: handle.current, status };
}
