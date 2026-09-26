import { getExercise } from '@/src/data/exercises';
import type { SensorFrame } from '@/src/engine/types';

import {
  evaluateTechnique,
  mergeSeverity,
  NO_VERDICT,
  sanitizeVerdict,
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
  return { t: 1000, exercise: squat, sensor, rigBody: null, ...over };
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

/**
 * The evaluator is someone else's code, run thirty times a second inside the
 * live screen. What it returns is held to the contract before anything is
 * tinted with it, so a bug in grading shows up as less said — never as a
 * wrong colour on the body.
 */
describe('a verdict is held to its contract', () => {
  afterEach(() => setTechniqueEvaluator(new StubEvaluator()));

  it('clamps severities into 0…1', () => {
    const v = sanitizeVerdict({ segments: { torso: 7, leftShin: -2 }, worst: null, computed: true, by: 'x' });
    expect(v.segments).toEqual({ torso: 1, leftShin: 0 });
  });

  it('drops NaN, infinities and non-numbers', () => {
    const v = sanitizeVerdict({
      segments: { torso: Number.NaN, leftArm: Number.POSITIVE_INFINITY, rightArm: '0.5' as unknown as number, hips: 0.3 },
      worst: null,
      computed: true,
      by: 'x',
    });
    expect(v.segments).toEqual({ hips: 0.3 });
  });

  it('drops a segment the renderer has never heard of', () => {
    const v = sanitizeVerdict({
      segments: { leftKnee: 1, leftThigh: 0.6 } as never,
      worst: null,
      computed: true,
      by: 'x',
    });
    expect(v.segments).toEqual({ leftThigh: 0.6 });
  });

  it('keeps a finding only if it can actually be shown', () => {
    const base = { segments: {}, computed: true, by: 'x' };
    expect(sanitizeVerdict({ ...base, worst: { segment: 'torso', label: '  ', severity: 1 } }).worst).toBeNull();
    expect(sanitizeVerdict({ ...base, worst: { segment: 'spine' as never, label: 'Rounding', severity: 1 } }).worst).toBeNull();
    expect(sanitizeVerdict({ ...base, worst: { segment: 'torso', label: 'Rounding', severity: Number.NaN } }).worst).toBeNull();
    expect(sanitizeVerdict({ ...base, worst: { segment: 'torso', label: ' Rounding ', severity: 3 } }).worst).toEqual({
      segment: 'torso',
      label: 'Rounding',
      severity: 1,
    });
  });

  it('treats anything but a real true as not computed', () => {
    expect(sanitizeVerdict({ segments: {}, worst: null, computed: 'yes' as unknown as boolean, by: 'x' }).computed).toBe(false);
  });

  it('turns a missing verdict into no opinion', () => {
    expect(sanitizeVerdict(undefined, 'broken')).toEqual({ ...NO_VERDICT, by: 'broken' });
  });

  it('is applied to whatever an installed evaluator returns', () => {
    setTechniqueEvaluator({
      name: 'sloppy',
      ready: () => true,
      evaluate: () => ({ segments: { torso: 5, nowhere: 1 } as never, worst: null, computed: true, by: '' }),
      reset: () => {},
    });
    const v = evaluateTechnique(input());
    expect(v.segments).toEqual({ torso: 1 });
    expect(v.by).toBe('sloppy');
  });

  it('survives an evaluator that throws while deciding whether it is ready', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setTechniqueEvaluator({
      name: 'fragile',
      ready: () => {
        throw new Error('no calibration yet');
      },
      evaluate: () => NO_VERDICT,
      reset: () => {},
    });
    expect(evaluateTechnique(input()).computed).toBe(false);
    warn.mockRestore();
  });
});

describe('mergeSeverity — what the body is tinted with', () => {
  const rules = { torso: 0.2, leftThigh: 0.9 };

  it('takes the worse of the two graders on every segment', () => {
    const v = { segments: { torso: 0.7, leftThigh: 0.4, rightShin: 1 }, worst: null, computed: true, by: 'x' };
    expect(mergeSeverity(rules, v)).toEqual({ torso: 0.7, leftThigh: 0.9, rightShin: 1 });
  });

  /** "Not checked" must never read as "checked and clean". */
  it('leaves the rule engine alone while the evaluator has no opinion', () => {
    const v = { segments: { torso: 1 }, worst: null, computed: false, by: 'stub' };
    expect(mergeSeverity(rules, v)).toBe(rules);
  });

  it('never lowers what the rule engine found', () => {
    const v = { segments: { leftThigh: 0 }, worst: null, computed: true, by: 'x' };
    expect(mergeSeverity(rules, v).leftThigh).toBe(0.9);
  });
});
