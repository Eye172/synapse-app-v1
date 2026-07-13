import { LM, type Landmark } from '@/src/engine/types';

/**
 * How close is the live body to the target ghost pose? 0..1.
 * Normalized by body scale so distance from the camera doesn't matter.
 */
const KEY_POINTS = [
  LM.nose,
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftHip,
  LM.rightHip,
  LM.leftKnee,
  LM.rightKnee,
  LM.leftAnkle,
  LM.rightAnkle,
  LM.leftWrist,
  LM.rightWrist,
];

export function alignmentScore(live: Landmark[], ghost: Landmark[]): number {
  const gHip = ghost[LM.leftHip];
  const gSh = ghost[LM.leftShoulder];
  const gAnk = ghost[LM.leftAnkle];
  if (!gHip || !gSh || !gAnk) return 0;
  const bodyScale = Math.abs(gAnk.y - gSh.y) + 1e-6;

  let sum = 0;
  let n = 0;
  for (const i of KEY_POINTS) {
    const a = live[i];
    const b = ghost[i];
    if (!a || !b || a.v < 0.3 || b.v < 0.3) continue;
    sum += Math.hypot(a.x - b.x, a.y - b.y) / bodyScale;
    n += 1;
  }
  if (n < 6) return 0;
  const meanRel = sum / n;
  // 0 error → 1.0; 20% of body height mean deviation → 0
  return Math.max(0, Math.min(1, 1 - meanRel / 0.2));
}
