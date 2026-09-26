import type { FrameSize, Landmark, WorldPoint } from '@/src/engine/types';

export type { FrameSize, WorldPoint };

/**
 * What a pose detector actually knows, kept in the two spaces that answer
 * two different questions.
 *
 * A single set of points cannot do both jobs. Normalized image coordinates
 * say *where on the screen the person is* but carry no scale: the same
 * numbers describe a child close up and an adult across the room. Metric
 * world coordinates say *what shape the body is* — real centimetres, hip at
 * the origin — but say nothing about where in the frame it was seen.
 *
 * The overlay needs both: the world points give a genuinely three
 * dimensional skeleton to build solids on, and the image points are what a
 * camera fit is solved against so those solids land on the person.
 */
export interface PoseObservation {
  /** capture time of the frame these came from, ms */
  t: number;
  /** normalized image space: x right 0..1, y down 0..1 */
  image: Landmark[];
  /**
   * Metric body space in this app's convention — x right, y up, z toward
   * the viewer — with the origin at the hip midpoint. Null when the
   * detector only produces image points, in which case there is no metric
   * body to build on and the overlay says so rather than inventing one.
   */
  world: WorldPoint[] | null;
  /** pixel size of the frame, which fixes the aspect the fit works in */
  frame: FrameSize;
}
