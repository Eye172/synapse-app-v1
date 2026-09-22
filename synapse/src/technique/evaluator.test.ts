import { getExercise } from '@/src/data/exercises';
import type { SensorFrame } from '@/src/engine/types';

import {
  evaluateTechnique,
  setTechniqueEvaluator,
  StubEvaluator,
  techniqueEvaluator,
  type TechniqueEvaluator,
  type TechniqueInput,
} from './evaluator';

/**
 * This is a handover point, so what is checked is the shape of the handover:
 * that the seam carries the rig's frames through, that whoever replaces the
 * stub cannot bring the overlay down with them, and — most of all — that a
 * placeholder never reports a clean lift it did not check.
 */

const squat = getExercise('back_squat')!;

function input(over: Partial<TechniqueInput> = {}): TechniqueInput {
  const sensor: SensorFrame = {
    t: 1000,
    protocol: 'v2-packed',
    flags: {},
    nodes: [
      { id: 'back', quat: [1, 0, 0, 0] },
      { id: 'leftLeg', quat: [1, 0, 0, 0] },
      { id: 'rightLeg', quat: [1, 0, 0, 0] },
      { id: 'leftArm', quat: [1, 0, 0, 0] },
      { id: 'rightArm', quat: [1, 0, 0, 0] },
    ],
  };
  return { t: 1000, exercise: squat, sensor, pose: null, ...over };
}

describe('the default evaluator', () => {
  beforeEach(() => setTechniqueEvaluator(new StubEvaluator()));

  it('is the stub until somebody installs a real one', () => {
    expect(techniqueEvaluator().name).toBe('stub');
  });

  it('says it has no opinion rather than reporting a clean lift', () => {
    const v = evaluateTechnique(input());
    // the distinction the whole seam turns on: "not checked" is not "fine"
    expect(v.computed).toBe(false);
    expect(v.segments).toEqual({});
    expect(v.worst).toBeNull();
  });

  it('names itself, so a build can be asked what is grading it', () => {
    expect(evaluateTechnique(input()).by).toBe('stub');
  });
});

describe('installing a real evaluator', () => {
  afterEach(() => setTechniqueEvaluator(new StubEvaluator()));

  it('takes over without anything else changing', () => {
    setTechniqueEvaluator({
      name: 'test',
      ready: () => true,
      evaluate: () => ({
        segments: { leftThigh: 1, torso: 0.4 },
        worst: { segment: 'leftThigh', label: 'Knee caving in', severity: 1 },
        computed: true,
        by: 'test',
      }),
      reset: () => {},
    });
    const v = evaluateTechnique(input());
    expect(v.computed).toBe(true);
    expect(v.segments.leftThigh).toBe(1);
    expect(v.worst?.label).toBe('Knee caving in');
  });

  it('is handed the rig frame it is supposed to judge', () => {
    let seen: TechniqueInput | null = null;
    setTechniqueEvaluator({
      name: 'spy',
      ready: () => true,
      evaluate: (i) => {
        seen = i;
        return { segments: {}, worst: null, computed: true, by: 'spy' };
      },
      reset: () => {},
    });
    evaluateTechnique(input());
    expect(seen!.sensor?.nodes).toHaveLength(5);
    expect(seen!.sensor?.nodes[0]?.quat).toEqual([1, 0, 0, 0]);
    expect(seen!.exercise.id).toBe('back_squat');
  });

  it('is not called at all while it says it is not ready', () => {
    let calls = 0;
    setTechniqueEvaluator({
      name: 'lazy',
      ready: () => false,
      evaluate: () => {
        calls++;
        return { segments: {}, worst: null, computed: true, by: 'lazy' };
      },
      reset: () => {},
    });
    const v = evaluateTechnique(input());
    expect(calls).toBe(0);
    expect(v.computed).toBe(false);
    expect(v.by).toBe('lazy');
  });

  it('cannot take the overlay down by throwing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setTechniqueEvaluator({
      name: 'broken',
      ready: () => true,
      evaluate: () => {
        throw new Error('bad maths');
      },
      reset: () => {},
    } as TechniqueEvaluator);
    const v = evaluateTechnique(input());
    expect(v.computed).toBe(false);
    expect(v.by).toBe('broken');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('copes with no rig linked at all', () => {
    setTechniqueEvaluator({
      name: 'cameraOnly',
      ready: (i) => i.sensor !== null,
      evaluate: () => ({ segments: { torso: 0.5 }, worst: null, computed: true, by: 'cameraOnly' }),
      reset: () => {},
    });
    expect(evaluateTechnique(input({ sensor: null })).computed).toBe(false);
    expect(evaluateTechnique(input()).computed).toBe(true);
  });
});
