import { LM, type Landmark, type SegmentId } from '@/src/engine/types';
import {
  defaultProportions,
  girthsFor,
  type BodyGirths,
  type BodyProportions,
  type Tube,
} from '@/src/vision/proportions';
import type { WorldPoint } from '@/src/vision/types';

import { cylinder, cylinderFaces, limbBox, type Cylinder, type P3, type Quad } from './volume';

/**
 * The body as an artist's mannequin, built in metres around a measured
 * person: boxes where the form is blocky, cylinders where it is round,
 * jointed by cubes.
 *
 * Chest, pelvis, head, hands, feet and every joint are boxes; neck, waist,
 * arms and legs are cylinders. A box states which way a part faces — the
 * plane of the chest, the tilt of the pelvis, whether a knee points where
 * the foot does — and that is the whole reason for drawing a body this way
 * rather than as sticks, because that is the axis most form faults happen
 * on and a flat stick figure cannot show it at all.
 *
 * Every dimension comes from `BodyProportions`, measured from the user by
 * the tracker. Nothing here is a fraction of anything chosen by eye.
 */

/** Visibility below this and the landmark is not worth drawing. */
const VIS = 0.15;

export type BodySolid = {
  segment: SegmentId;
  /**
   * True when nothing measured this part and its position was continued
   * from the parent. Drawn fainter: a confident outline would assert a
   * position nothing observed.
   */
  inferred: boolean;
} & ({ kind: 'box'; faces: Quad[] } | { kind: 'cylinder'; cyl: Cylinder });

/** Every face of a solid, for depth ordering across the whole figure. */
export function solidFaces(s: BodySolid): Quad[] {
  return s.kind === 'box' ? s.faces : cylinderFaces(s.cyl);
}

/**
 * Landmark space to metric body space, for pose sources that have no metric
 * of their own.
 *
 * The Rig's forward kinematics produces a normalized figure — it knows the
 * angles of five segments, not how tall the wearer is — so it is scaled to
 * a stated height. The camera path does not come through here: its detector
 * already reports centimetres and converting back and forth would only lose
 * them.
 */
export function worldFromLandmarks(landmarks: Landmark[], height = 1.72): WorldPoint[] {
  const ls = landmarks[LM.leftShoulder];
  const rs = landmarks[LM.rightShoulder];
  const lh = landmarks[LM.leftHip];
  const rh = landmarks[LM.rightHip];
  // scale so the trunk comes out at its anthropometric share of the height
  let k = height * 2;
  let ox = 0.5;
  let oy = 0.5;
  if (ls && rs && lh && rh) {
    const sx = (ls.x + rs.x) / 2;
    const sy = (ls.y + rs.y) / 2;
    ox = (lh.x + rh.x) / 2;
    oy = (lh.y + rh.y) / 2;
    const trunk = Math.hypot(sx - ox, sy - oy);
    if (trunk > 1e-4) k = (height * 0.288) / trunk;
  }
  return landmarks.map((l) => ({
    x: (l.x - ox) * k,
    y: -(l.y - oy) * k,
    z: (l.z ?? 0) * k,
    v: l.v,
  }));
}

function mid(a: P3, b: P3): P3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function lerp(from: P3, to: P3, t: number): P3 {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  };
}

function sub(a: P3, b: P3): P3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a: P3, b: P3): P3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(a: P3, s: number): P3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function len(a: P3): number {
  return Math.hypot(a.x, a.y, a.z) || 1e-9;
}

function unit(a: P3): P3 {
  const l = len(a);
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

function cross(a: P3, b: P3): P3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: P3, b: P3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Continue past `to` by a fraction of the segment — hands, feet, the skull. */
function extend(from: P3, to: P3, t: number): P3 {
  return lerp(from, to, 1 + t);
}

/** Rotate `t` of the way from one unit direction to another. */
function slerpDir(from: P3, to: P3, t: number): P3 {
  const c = Math.max(-1, Math.min(1, dot(from, to)));
  const ang = Math.acos(c);
  if (ang < 1e-6) return to;
  const s = Math.sin(ang);
  return unit(
    add(scale(from, Math.sin((1 - t) * ang) / s), scale(to, Math.sin(t * ang) / s)),
  );
}

/**
 * How far a skull may lean away from the spine, radians.
 *
 * A neck gives perhaps forty degrees of nod and a similar amount of tip
 * before the whole trunk has to follow; past that, what is being measured
 * is not a neck. Face landmarks are reconstructed rather than seen whenever
 * someone is turned away from the lens — which, for a lifter, is most of
 * the time — and unconstrained they tumble the head through angles no neck
 * has. A tumbled box also projects to its own diagonal, so the skull looks
 * several times too large at the same time as it looks wrong.
 */
const MAX_HEAD_TILT = 0.7;

/**
 * Which way is across and which way is forward.
 *
 * `limbBox` derives its cross-section from the reference axis handed to it:
 * the width runs along `cross(axis, ref)` and the depth along `ref` itself,
 * once both are squared to the limb. Passing the shoulder line as the
 * reference for an upright box therefore puts the *width* into the depth
 * axis and vice versa — which is how the chest came to be built nearly a
 * shoulder-span deep and read as a barrel. Passing the forward direction
 * instead makes the two arguments mean what they are called.
 */
export interface BodyFrame {
  /** left to right across the shoulders, unit */
  across: P3;
  /** hips to shoulders, unit */
  up: P3;
  /** out of the chest toward the viewer, unit */
  forward: P3;
}

export function bodyFrame(across: P3, up: P3): BodyFrame {
  const u = unit(up);
  // square the shoulder line to the spine before using it as a basis
  const a = unit(sub(across, scale(u, dot(across, u))));
  // up x across, not across x up: with x right, y up and z toward the
  // viewer, only this order puts `forward` out through the chest for a
  // person facing the lens and out through the chest again for one facing
  // away. The other order names the direction behind them "forward", which
  // costs nothing while a box is symmetric and quietly inverts any frame
  // built on top of it — the head's, for instance.
  return { across: a, up: u, forward: unit(cross(u, a)) };
}

export interface BodyModel {
  solids: BodySolid[];
  proportions: BodyProportions;
  girths: BodyGirths;
  frame: BodyFrame | null;
}

/**
 * Build the mannequin. `world` is metric, hips near the origin, y up.
 *
 * `girths` is an escape hatch for measuring the figure against something
 * real — a segmentation mask of the actual person, say — without which the
 * thicknesses can only ever be argued about rather than checked.
 */
export function buildBody(
  world: WorldPoint[],
  proportions?: BodyProportions,
  girths?: BodyGirths,
): BodyModel {
  const p = proportions ?? defaultProportions();
  const g = girths ?? girthsFor(p);
  const out: BodySolid[] = [];

  const at = (i: number): WorldPoint | null => {
    const l = world[i];
    return l && l.v > VIS ? l : null;
  };
  const pt = (i: number): P3 | null => {
    const l = at(i);
    return l ? { x: l.x, y: l.y, z: l.z } : null;
  };

  const ls = pt(LM.leftShoulder);
  const rs = pt(LM.rightShoulder);
  const lh = pt(LM.leftHip);
  const rh = pt(LM.rightHip);
  if (!ls || !rs || !lh || !rh) return { solids: out, proportions: p, girths: g, frame: null };

  const shoulderC = mid(ls, rs);
  const hipC = mid(lh, rh);
  const f = bodyFrame(sub(rs, ls), sub(shoulderC, hipC));
  const fwd = f.forward;

  const box = (
    segment: SegmentId,
    a: P3,
    b: P3,
    width: number,
    depth: number,
    inferred: boolean,
    ref: P3 = fwd,
  ) => out.push({ kind: 'box', segment, inferred, faces: limbBox(a, b, width / 2, depth / 2, ref) });

  const tube = (segment: SegmentId, a: P3, b: P3, shape: number | Tube, inferred: boolean, ref: P3 = fwd) =>
    out.push({ kind: 'cylinder', segment, inferred, cyl: cylinder(a, b, shape, 16, ref) });

  /** A joint cube, centred on the point and squared to the limb through it. */
  const joint = (segment: SegmentId, here: P3, towards: P3, size: number, inferred: boolean) => {
    const dir = unit(sub(towards, here));
    const half = scale(dir, size / 2);
    box(segment, sub(here, half), add(here, half), size, size, inferred);
  };

  // ---- trunk ------------------------------------------------------------
  // The pelvis is a block across the hips; the ribcage is a block hanging
  // under the shoulder line, noticeably narrower than the shoulders are
  // wide; the waist is the tube between them.
  //
  // The pelvis block runs *along* the hip line, so its span is already set
  // by where the two hip landmarks are and the two numbers below are its
  // cross-section: how tall it is, and how deep. Passing the hip width as
  // the first of them — which reads perfectly naturally — built a pelvis as
  // tall as it was wide, a third of a metre of hip on an adult.
  box('hips', lh, rh, g.pelvisHeight, g.pelvisDepth, false, fwd);
  const pelvisTop = add(hipC, scale(f.up, p.trunkLength * 0.16));
  const chestBottom = add(hipC, scale(f.up, p.trunkLength * 0.46));
  tube('torso', pelvisTop, chestBottom, g.waist, false);
  box('torso', chestBottom, shoulderC, g.chestWidth, g.chestDepth, false, fwd);

  // ---- neck and head ----------------------------------------------------
  // A head needs its own frame, built from its own landmarks.
  //
  // The obvious thing — point the head along the neck, from the top of the
  // spine to the middle of the ears — is badly conditioned. Those two
  // points are barely a hand apart, and the ear canals sit forward of the
  // spine on everyone, so the vector between them leans forward by tens of
  // degrees before the head has tilted at all. Measured on a lifter facing
  // away from the lens it came out 54 degrees off the spine, which drew the
  // skull as a cube pitched over one shoulder and, because a tilted box
  // projects to a much larger footprint than a square one, made it look
  // several times too big as well.
  //
  // The ear line and the nose are far apart and well detected, so they give
  // a frame directly: across the skull, out through the face, and up as the
  // one direction perpendicular to both.
  const le = pt(LM.leftEar);
  const re = pt(LM.rightEar);
  const nose = pt(LM.nose);
  let headUp = f.up;
  let headFwd = fwd;
  let headC: P3;

  if (le && re && nose) {
    const across = unit(sub(re, le));
    const earC = mid(le, re);
    // square the face direction to the ear line before crossing them
    const raw = sub(nose, earC);
    const face = unit(sub(raw, scale(across, dot(raw, across))));
    let up = unit(cross(across, face));
    if (len(up) > 0.5) {
      // a neck, not a ball joint: pull anything past a neck's range back
      const lean = Math.acos(Math.max(-1, Math.min(1, dot(up, f.up))));
      if (lean > MAX_HEAD_TILT) up = slerpDir(f.up, up, MAX_HEAD_TILT / lean);
      headUp = up;
      // re-square the face direction to whatever the head's up ended up being
      headFwd = unit(sub(face, scale(up, dot(face, up))));
      if (len(headFwd) < 0.5) headFwd = fwd;
    }
    // the ear canal sits a little below the middle of the skull
    headC = add(earC, scale(headUp, p.headHeight * 0.08));
  } else {
    headC = add(shoulderC, scale(f.up, p.neck + p.headHeight * 0.5));
  }

  const headBottom = sub(headC, scale(headUp, p.headHeight * 0.5));
  const headTop = add(headC, scale(headUp, p.headHeight * 0.5));
  box('head', headBottom, headTop, g.headWidth, g.headDepth, false, headFwd);

  // the neck reaches from the shoulders to wherever the head actually is,
  // rather than to a fixed point the head may have moved away from
  const neckEnd = len(sub(headBottom, shoulderC)) > p.neck * 0.25 ? headBottom : add(shoulderC, scale(f.up, p.neck));
  tube('neck', shoulderC, neckEnd, g.neck, false);

  // ---- arms: shoulder ball, upper, elbow, forearm, mitten ---------------
  const arm = (
    shoulder: P3,
    upperSeg: SegmentId,
    lowerSeg: SegmentId,
    elbowIdx: number,
    wristIdx: number,
    indexIdx: number,
  ) => {
    const elbow = pt(elbowIdx);
    if (!elbow) return;
    const upperEst = at(elbowIdx)?.v === undefined;
    joint(upperSeg, shoulder, elbow, g.shoulderRadius * 2, upperEst);
    tube(upperSeg, shoulder, elbow, g.upperArm, upperEst);
    const wrist = pt(wristIdx);
    if (!wrist) return;
    joint(upperSeg, elbow, wrist, g.elbowRadius * 2, upperEst);
    tube(lowerSeg, elbow, wrist, g.forearm, upperEst);
    // the hand is a mitten: a block carrying on the line of the forearm
    const tip = pt(indexIdx) ?? extend(elbow, wrist, p.hand / len(sub(wrist, elbow)));
    box(lowerSeg, wrist, tip, g.handWidth, g.handThickness, upperEst);
  };
  arm(ls, 'leftArm', 'leftForearm', LM.leftElbow, LM.leftWrist, LM.leftIndex);
  arm(rs, 'rightArm', 'rightForearm', LM.rightElbow, LM.rightWrist, LM.rightIndex);

  // ---- legs: thigh, knee cube, shin, foot block -------------------------
  const leg = (
    hip: P3,
    thighSeg: SegmentId,
    shinSeg: SegmentId,
    kneeIdx: number,
    ankleIdx: number,
    toeIdx: number,
  ) => {
    const knee = pt(kneeIdx);
    if (!knee) return;
    tube(thighSeg, hip, knee, g.thigh, false);
    const ankle = pt(ankleIdx);
    if (!ankle) return;
    // the knee is where valgus shows, so it gets a face that can point wrong
    joint(thighSeg, knee, ankle, g.kneeRadius * 2, false);
    tube(shinSeg, knee, ankle, g.shin, false);
    const toe = pt(toeIdx) ?? extend(knee, ankle, p.foot / len(sub(ankle, knee)));
    // a foot box is oriented by the spine, so its sole stays under it
    box(shinSeg, ankle, toe, g.footWidth, g.footHeight, false, f.up);
  };
  leg(lh, 'leftThigh', 'leftShin', LM.leftKnee, LM.leftAnkle, LM.leftFootIndex);
  leg(rh, 'rightThigh', 'rightShin', LM.rightKnee, LM.rightAnkle, LM.rightFootIndex);

  return { solids: out, proportions: p, girths: g, frame: f };
}

/** Just the solids, for callers that do not need the measurements back. */
export function bodyVolumes(world: WorldPoint[], proportions?: BodyProportions): BodySolid[] {
  return buildBody(world, proportions).solids;
}
