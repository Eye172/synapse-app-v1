import type { FrameSize } from './types';

/**
 * Where the camera's picture actually lands on the screen.
 *
 * The overlay is solved in the camera frame's own pixels, because that is
 * the space the detector reported and the only space the fit means anything
 * in. The preview underneath is a different size and almost always a
 * different shape — a 4:3 sensor shown full-bleed on a 19.5:9 phone — so
 * something has to say how one maps onto the other. Getting this wrong does
 * not look like a bug: the figure simply sits a little off the person, more
 * so toward the edges, on some devices and not others.
 *
 * Mirroring belongs here too. A front camera preview is flipped so it reads
 * like a mirror, while the frames handed to the detector are not, so the
 * landmarks describe a person facing the other way from the one on screen.
 */
export interface Viewport {
  /** uniform scale from frame pixels to screen pixels */
  scale: number;
  /** where the scaled frame's top-left sits, screen pixels */
  offsetX: number;
  offsetY: number;
  /** true when the preview is flipped left-to-right */
  mirrored: boolean;
  screen: FrameSize;
  frame: FrameSize;
  /** frame pixels to screen pixels */
  toScreen(x: number, y: number): { x: number; y: number };
  /** screen pixels back to frame pixels */
  toFrame(x: number, y: number): { x: number; y: number };
}

function make(
  frame: FrameSize,
  screen: FrameSize,
  scale: number,
  mirrored: boolean,
): Viewport {
  const offsetX = (screen.width - frame.width * scale) / 2;
  const offsetY = (screen.height - frame.height * scale) / 2;
  return {
    scale,
    offsetX,
    offsetY,
    mirrored,
    screen,
    frame,
    toScreen(x, y) {
      const sx = offsetX + x * scale;
      return { x: mirrored ? screen.width - sx : sx, y: offsetY + y * scale };
    },
    toFrame(x, y) {
      const sx = mirrored ? screen.width - x : x;
      return { x: (sx - offsetX) / scale, y: (y - offsetY) / scale };
    },
  };
}

/**
 * The preview fills the screen and the overflow is cropped — what a camera
 * view does by default, and what the live screen wants: a letterboxed
 * lifter in a black frame is not a cockpit.
 */
export function coverViewport(frame: FrameSize, screen: FrameSize, mirrored = false): Viewport {
  if (frame.width <= 0 || frame.height <= 0) return make(frame, screen, 1, mirrored);
  return make(
    frame,
    screen,
    Math.max(screen.width / frame.width, screen.height / frame.height),
    mirrored,
  );
}

/** The whole frame is visible and the leftover screen is empty — for review. */
export function containViewport(frame: FrameSize, screen: FrameSize, mirrored = false): Viewport {
  if (frame.width <= 0 || frame.height <= 0) return make(frame, screen, 1, mirrored);
  return make(
    frame,
    screen,
    Math.min(screen.width / frame.width, screen.height / frame.height),
    mirrored,
  );
}

/** One frame pixel to one screen pixel — for drawing onto the frame itself. */
export function identityViewport(frame: FrameSize, mirrored = false): Viewport {
  return make(frame, frame, 1, mirrored);
}
