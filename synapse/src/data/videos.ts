/**
 * Bundled lesson footage.
 *
 * The source clips in `materials/videoInstructions` are named 1–4 with no
 * indication of contents, and were originally mapped onto the first four
 * exercises by position. That was a guess, and half of it was wrong. Each
 * clip captions itself on screen, so the ground truth is:
 *
 *   1.MP4  SQUAT           → back_squat
 *   2.MP4  PULL-UPS        → nothing this app coaches
 *   3.MP4  SHOULDER PRESS  → overhead_press
 *   4.MP4  LEG RAISES      → nothing this app coaches
 *
 * Only the two that match are bundled, and they are keyed by what they show
 * rather than by their position, so the mismatch cannot quietly return. The
 * lifts with no clip say so; a pull-up standing in for a deadlift teaches the
 * wrong movement to somebody holding a loaded bar.
 *
 * These are reference clips, not footage of the Rig — nothing in them is
 * wearing one. Metro needs static requires.
 */
export const TUTORIAL_VIDEOS: Record<string, number> = {
  squat: require('../../assets/videos/clip1.mp4'),
  shoulderPress: require('../../assets/videos/clip3.mp4'),
};

export function tutorialVideo(videoKey: string | null): number | null {
  if (!videoKey) return null;
  return TUTORIAL_VIDEOS[videoKey] ?? null;
}
