/**
 * Bundled tutorial footage — real clips shot on the Rig prototype
 * (materials/videoInstructions). Metro needs static requires.
 * Clips are labelled as RIG FOOTAGE in the player; remap here if the
 * clip-to-exercise assignment changes.
 */
export const TUTORIAL_VIDEOS: Record<string, number> = {
  clip1: require('../../assets/videos/clip1.mp4'),
  clip2: require('../../assets/videos/clip2.mp4'),
  clip3: require('../../assets/videos/clip3.mp4'),
  clip4: require('../../assets/videos/clip4.mp4'),
};

export function tutorialVideo(videoKey: string | null): number | null {
  if (!videoKey) return null;
  return TUTORIAL_VIDEOS[videoKey] ?? null;
}
