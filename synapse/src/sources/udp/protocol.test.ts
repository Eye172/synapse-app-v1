import { parseRigPayload, quatPitchDeg } from './protocol';

describe('Rig payload normalizer (§2.9)', () => {
  const NOW = 1234567;

  it('parses the exact firmware v0 payload', () => {
    const f = parseRigPayload('{"angle": 41.7, "alert": true}', NOW);
    expect(f).not.toBeNull();
    expect(f!.t).toBe(NOW);
    expect(f!.nodes).toEqual([{ id: 'spine', angleDeg: 41.7 }]);
    expect(f!.flags.alert).toBe(true);
  });

  it('parses v0 without alert', () => {
    const f = parseRigPayload('{"angle": 88.2}', NOW);
    expect(f!.nodes[0]!.angleDeg).toBeCloseTo(88.2);
    expect(f!.flags.alert).toBeUndefined();
  });

  it('parses v1 with nodes and battery', () => {
    const f = parseRigPayload(
      JSON.stringify({ v: 1, t: 1723200000, nodes: [{ id: 'spine', angle: 52 }], batt: 83 }),
      NOW,
    );
    expect(f!.nodes[0]).toEqual({ id: 'spine', angleDeg: 52 });
    expect(f!.battery).toBe(83);
  });

  it('derives pitch from a v1 quaternion like the firmware does', () => {
    // identity-ish quaternion → pitch ~0
    const f = parseRigPayload(JSON.stringify({ v: 1, nodes: [{ id: 'spine', q: [0, 0, 0, 1] }] }), NOW);
    expect(f!.nodes[0]!.angleDeg).toBeCloseTo(0, 3);
    // 90° pitch about x: q = [sin45, 0, 0, cos45]
    const s = Math.SQRT1_2;
    const f2 = parseRigPayload(JSON.stringify({ v: 1, nodes: [{ id: 'spine', q: [s, 0, 0, s] }] }), NOW);
    expect(f2!.nodes[0]!.angleDeg).toBeCloseTo(90, 3);
  });

  it.each([
    ['garbage', 'not json at all'],
    ['half json', '{"angle": 41.'],
    ['string angle', '{"angle": "41.7"}'],
    ['NaN angle', '{"angle": null}'],
    ['array root', '[1,2,3]'],
    ['empty', ''],
    ['no recognizable fields', '{"foo": 1}'],
    ['nodes not array', '{"nodes": 5}'],
    ['node bad id', '{"nodes":[{"id":"../etc","angle":10}]}'],
    ['node angle infinity', '{"nodes":[{"id":"spine","angle":1e999}]}'],
  ])('rejects %s without throwing', (_name, payload) => {
    expect(parseRigPayload(payload, NOW)).toBeNull();
  });

  it('rejects oversized payloads and node floods', () => {
    expect(parseRigPayload('x'.repeat(5000), NOW)).toBeNull();
    const flood = JSON.stringify({ nodes: Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, angle: 1 })) });
    expect(parseRigPayload(flood, NOW)).toBeNull();
  });

  it('clamps absurd angles into a sane range', () => {
    const f = parseRigPayload('{"angle": 100000}', NOW);
    expect(f!.nodes[0]!.angleDeg).toBe(360);
  });

  it('accepts raw bytes', () => {
    const bytes = new TextEncoder().encode('{"angle": 45.0, "alert": false}');
    const f = parseRigPayload(bytes, NOW);
    expect(f!.nodes[0]!.angleDeg).toBe(45);
    expect(f!.flags.alert).toBe(false);
  });

  it('quatPitchDeg folds like the firmware display_angle', () => {
    // pitch beyond 90 folds back (180 - a)
    expect(quatPitchDeg([Math.sin(Math.PI / 3), 0, 0, Math.cos(Math.PI / 3)])).toBeCloseTo(60, 1);
  });
});
