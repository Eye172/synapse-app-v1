import type { SegmentId } from '@/src/engine/types';
import type { SegmentSeverity } from '@/src/technique/evaluator';
import { meshSeverityColor } from '@/src/theme/tokens';

import { solidFaces, type BodySolid } from './bodyVolumes';
import {
  centroid,
  faceDepth,
  facesAway,
  painterSort,
  shade,
  type Camera,
  type Projector,
  type Quad,
} from './volume';

/**
 * The body reduced to a depth-ordered list of painted polygons.
 *
 * Deliberately knows nothing about Skia, canvas, or React. Whatever is
 * drawing — the phone's renderer, or a browser page checking the pipeline —
 * consumes the same list, which is the only way a harness can honestly
 * claim to show what the app shows. A verification page with its own
 * drawing logic verifies its own drawing logic.
 */

export interface Facet {
  /** distance from the eye — already sorted far to near */
  depth: number;
  /** the polygon in canvas pixels */
  pts: { x: number; y: number }[];
  /** rgba, or null when this style does not fill */
  fill: string | null;
  /** rgba, or null when this style does not stroke */
  stroke: string | null;
  strokeWidth: number;
  /** which body part this belongs to, for hit-testing and diagnostics */
  segment: SegmentId;
}

export interface FacetOptions {
  /** 0..1 fill opacity; 0 draws outline only */
  fill: number;
  /** 0..1 edge opacity; 0 draws fill only */
  edge: number;
  /** multiplies line weight, so a tablet does not get hairlines */
  lineScale: number;
  /**
   * A studio camera to light from, or null to light against the eye.
   *
   * A fitted camera has no fixed orientation to place a lamp in — it points
   * wherever the phone was pointing — so the figure is lit by how squarely
   * each face meets the lens instead.
   */
  lightWith: Camera | null;
}

/** Multiply a colour by a lighting factor, keeping it a valid CSS/RN colour. */
export function litColor(base: string, k: number, alpha: number): string {
  let r = 0;
  let g = 0;
  let b = 0;
  if (base.startsWith('#')) {
    r = parseInt(base.slice(1, 3), 16);
    g = parseInt(base.slice(3, 5), 16);
    b = parseInt(base.slice(5, 7), 16);
  } else {
    const m = base.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
      r = Number(m[1]);
      g = Number(m[2]);
      b = Number(m[3]);
    }
  }
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgba(${f(r)}, ${f(g)}, ${f(b)}, ${Number(alpha.toFixed(3))})`;
}

/** Lambert against the eye, for when there is no studio camera to light from. */
function shadeFlat(q: Quad, proj: Projector): number {
  const e = proj.eyeDir(centroid(q.corners));
  const d = q.normal.x * e.x + q.normal.y * e.y + q.normal.z * e.z;
  return 0.45 + 0.55 * Math.max(0, d);
}

function projectFace(q: Quad, proj: Projector): { x: number; y: number }[] | null {
  const out: { x: number; y: number }[] = [];
  for (const c of q.corners) {
    const s = proj.to2D(c);
    // one corner behind the lens makes the whole face meaningless
    if (!s.visible) return null;
    out.push({ x: s.x, y: s.y });
  }
  return out;
}

/**
 * Turn solids into faces to paint, furthest first.
 *
 * Sorting faces rather than whole limbs is what lets an arm pass in front
 * of the chest correctly; sorting by limb would make it pop through the
 * moment the two overlapped.
 *
 * Back faces are dropped rather than drawn and covered over. Each solid is
 * convex, so its front faces tile its silhouette exactly once — which is
 * what makes a translucent fill come out at the opacity it was asked for.
 * Keeping the back faces would double the colour on every part and a clean
 * segment would read as a faulted one purely for having two walls.
 */
export function buildFacets(
  solids: BodySolid[],
  proj: Projector,
  severity: SegmentSeverity,
  opts: FacetOptions,
): Facet[] {
  const out: Facet[] = [];

  for (const solid of solids) {
    const sev = severity[solid.segment] ?? 0;
    const base = meshSeverityColor(sev);
    const faulted = sev >= 0.999;
    // a part nothing measured is a fainter claim than the rest of the figure
    const conviction = solid.inferred ? 0.4 : 1;

    for (const q of solidFaces(solid)) {
      if (facesAway(q, proj)) continue;
      const pts = projectFace(q, proj);
      if (!pts) continue;
      const k = opts.lightWith ? shade(q.normal, opts.lightWith) : shadeFlat(q, proj);
      out.push({
        depth: faceDepth(q, proj),
        pts,
        segment: solid.segment,
        fill: opts.fill > 0 ? litColor(base, k, opts.fill * conviction) : null,
        stroke: opts.edge > 0 ? litColor(base, faulted ? 1.3 : 1.05, opts.edge * conviction) : null,
        strokeWidth: (faulted ? 2.2 : 1.1) * opts.lineScale,
      });
    }
  }
  return painterSort(out);
}

export type OverlayStyle =
  /** filled translucent solids — the default, and what reads as 3D */
  | 'solid'
  /** filled and opaque enough to study the form on its own */
  | 'study'
  /** edges only, for looking straight at the frame underneath */
  | 'contour';

export const OVERLAY_STYLES: Record<OverlayStyle, { fill: number; edge: number; scrim: number }> = {
  solid: { fill: 0.34, edge: 0.8, scrim: 0.34 },
  study: { fill: 0.66, edge: 0.95, scrim: 0.55 },
  contour: { fill: 0, edge: 0.95, scrim: 0.18 },
};
