import { LM, type Landmark } from '@/src/engine/types';

import { EDGE_MARGIN, FRAMED_JOINTS, assessFraming } from './framing';

/** A person standing in the middle of the screen, every joint clearly seen. */
function standing(): Landmark[] {
  const pts: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, v: 0.95 }));
  const set = (i: number, x: number, y: number) => (pts[i] = { x, y, z: 0, v: 0.95 });
  set(LM.nose, 0.5, 0.15);
  set(LM.leftShoulder, 0.42, 0.25);
  set(LM.rightShoulder, 0.58, 0.25);
  set(LM.leftHip, 0.45, 0.52);
  set(LM.rightHip, 0.55, 0.52);
  set(LM.leftKnee, 0.45, 0.7);
  set(LM.rightKnee, 0.55, 0.7);
  set(LM.leftAnkle, 0.45, 0.88);
  set(LM.rightAnkle, 0.55, 0.88);
  return pts;
}

describe('assessFraming — is the lifter framed well enough to grade', () => {
  it('is ready only when every graded joint is seen and the body is placed', () => {
    expect(assessFraming(standing(), true)).toEqual({ issue: 'ready', seen: 8, total: 8 });
    expect(assessFraming(standing(), false).issue).toBe('measuring');
  });

  it('finds nobody without landmarks, or with none seen', () => {
    expect(assessFraming(null, true).issue).toBe('nobody');
    const dark = standing().map((p) => ({ ...p, v: 0.1 }));
    expect(assessFraming(dark, true).issue).toBe('nobody');
  });

  it('asks to step back when the feet are below the screen or not seen', () => {
    const low = standing();
    low[LM.leftAnkle] = { ...low[LM.leftAnkle]!, y: 1.05 };
    expect(assessFraming(low, true).issue).toBe('feet');

    const hidden = standing();
    hidden[LM.rightAnkle] = { ...hidden[LM.rightAnkle]!, v: 0.2 };
    expect(assessFraming(hidden, true)).toMatchObject({ issue: 'feet', seen: 7 });
  });

  it('asks to step back when the head or shoulders are above the screen', () => {
    const tall = standing();
    tall[LM.leftShoulder] = { ...tall[LM.leftShoulder]!, y: -0.02 };
    expect(assessFraming(tall, true).issue).toBe('head');
  });

  it('treats a joint inside the edge margin as off screen', () => {
    const side = standing();
    side[LM.leftShoulder] = { ...side[LM.leftShoulder]!, x: EDGE_MARGIN / 2 };
    expect(assessFraming(side, true).issue).toBe('edge');
  });

  it('calls a hidden upper joint unclear rather than asking to step back', () => {
    const hidden = standing();
    hidden[LM.leftHip] = { ...hidden[LM.leftHip]!, v: 0.2 };
    expect(assessFraming(hidden, true).issue).toBe('unclear');
  });

  it('grades from the eight joints the rules read', () => {
    expect(FRAMED_JOINTS).toHaveLength(8);
  });
});
