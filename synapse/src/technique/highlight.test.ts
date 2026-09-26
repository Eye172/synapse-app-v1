import { ALL_SEGMENTS } from '@/src/engine/types';

import { BODY_PARTS, SEGMENTS_OF_NODE, SEVERITY, highlight, notChecked } from './highlight';

describe('highlight — ready-made commands for the 3D body', () => {
  it('turns a fault on a body part into red segments and the finding', () => {
    const v = highlight('t').fault('leftLeg', 'Knee caving in', { cue: 'Knees out' }).verdict();
    expect(v.segments).toEqual({ leftThigh: 1, leftShin: 1 });
    expect(v.worst).toEqual({ segment: 'leftThigh', label: 'Knee caving in', severity: 1, cue: 'Knees out' });
    expect(v.computed).toBe(true);
    expect(v.by).toBe('t');
  });

  it('uses the same thresholds as the live screen', () => {
    expect(highlight('t').drift('torso', 'x').verdict().segments.torso).toBe(SEVERITY.DRIFT);
    expect(SEVERITY.DRIFT).toBe(0.55);
    expect(SEVERITY.FAULT).toBe(1);
  });

  it('keeps the worst mark on a segment and the most severe labelled finding', () => {
    const v = highlight('t')
      .drift('torso', 'Chest dropping')
      .fault('trunk', 'Back rounding')
      .watch('torso')
      .verdict();
    expect(v.segments.torso).toBe(1);
    expect(v.worst?.label).toBe('Back rounding');
  });

  it('lets a quiet tint stay quiet: no label, no finding', () => {
    const v = highlight('t').watch('rightShin').verdict();
    expect(v.segments.rightShin).toBe(SEVERITY.WATCH);
    expect(v.worst).toBeNull();
  });

  it('scales a measurement between clean and fault', () => {
    const at = (x: number) => highlight('t').measure('leftLeg', x, { ok: 0.05, fault: 0.25 }, 'Knee').verdict();
    expect(at(0.0).segments.leftThigh).toBe(0);
    expect(at(0.0).worst).toBeNull();
    expect(at(0.15).segments.leftThigh).toBeCloseTo(0.5);
    expect(at(0.9).segments.leftThigh).toBe(1);
    expect(at(0.9).worst?.label).toBe('Knee');
  });

  it('accepts lists mixing segments and body parts', () => {
    const v = highlight('t').mark(['head', 'rightArm'], 0.4).verdict();
    expect(Object.keys(v.segments).sort()).toEqual(['head', 'neck', 'rightArm', 'rightForearm'].sort());
  });

  it('clamps nonsense to the 0…1 range', () => {
    const v = highlight('t').mark('hips', 5).mark('neck', Number.NaN).verdict();
    expect(v.segments).toEqual({ hips: 1, neck: 0 });
  });

  it('says "checked and clean" and "not checked" differently', () => {
    expect(highlight('t').verdict()).toEqual({ segments: {}, worst: null, computed: true, by: 't' });
    expect(notChecked('t').computed).toBe(false);
  });

  it('only names segments the renderer draws', () => {
    const known = new Set(ALL_SEGMENTS);
    for (const group of Object.values(BODY_PARTS)) for (const s of group) expect(known.has(s)).toBe(true);
    for (const group of Object.values(SEGMENTS_OF_NODE)) for (const s of group) expect(known.has(s)).toBe(true);
    expect(new Set(BODY_PARTS.all)).toEqual(known);
  });
});
