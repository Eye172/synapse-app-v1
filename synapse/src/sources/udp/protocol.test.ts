import { RIG_NODE_ORDER } from '@/src/engine/types';

import { parseRigPayload, quatPitchDeg } from './protocol';

const NOW = 1234567;
const s = Math.SQRT1_2;

describe('Rig payload normalizer — v2 named form (§2.9)', () => {
  // the exact shape the firmware ships: `a` for alert, `q` for quaternion
  const named = {
    back: { a: false, q: { r: 1.0, i: 0.0, j: 0.0, k: 0.0 } },
    leftArm: { a: false, q: { r: s, i: s, j: 0.0, k: 0.0 } },
    leftLeg: { a: false, q: { r: 1.0, i: 0.0, j: 0.0, k: 0.0 } },
    rightArm: { a: true, q: { r: 1.0, i: 0.0, j: 0.0, k: 0.0 } },
    rightLeg: { a: false, q: { r: 1.0, i: 0.0, j: 0.0, k: 0.0 } },
  };

  it('parses all five nodes with per-node alerts', () => {
    const f = parseRigPayload(JSON.stringify(named), NOW)!;
    expect(f).not.toBeNull();
    expect(f.protocol).toBe('v2-named');
    expect(f.nodes).toHaveLength(5);
    expect(f.nodes.map((n) => n.id).sort()).toEqual(
      ['back', 'leftArm', 'leftLeg', 'rightArm', 'rightLeg'].sort(),
    );
    const leftArm = f.nodes.find((n) => n.id === 'leftArm')!;
    // scalar-first (r,i,j,k), unit-normalized
    expect(leftArm.quat![0]).toBeCloseTo(s, 5);
    expect(leftArm.quat![1]).toBeCloseTo(s, 5);
  });

  it('raises the frame alert when any single node alerts', () => {
    const f = parseRigPayload(JSON.stringify(named), NOW)!;
    expect(f.flags.alert).toBe(true);
    expect(f.nodes.find((n) => n.id === 'rightArm')!.alert).toBe(true);
    expect(f.nodes.find((n) => n.id === 'back')!.alert).toBe(false);
  });

  it('accepts a partial rig — nodes may drop out independently', () => {
    const f = parseRigPayload(
      JSON.stringify({ back: named.back, leftLeg: named.leftLeg }),
      NOW,
    )!;
    expect(f.nodes).toHaveLength(2);
    expect(f.flags.alert).toBe(false);
  });

  it('tolerates the Python repr a raw str(dict) would emit', () => {
    // MicroPython str(dict): single quotes and capitalised False
    const pythonish = "{'back': {'a': False, 'q': {'r': 1.0, 'i': 0.0, 'j': 0.0, 'k': 0.0}}}";
    const f = parseRigPayload(pythonish, NOW)!;
    expect(f).not.toBeNull();
    expect(f.nodes[0]!.id).toBe('back');
    expect(f.nodes[0]!.alert).toBe(false);
  });

  it('reads battery when present', () => {
    const f = parseRigPayload(JSON.stringify({ ...named, batt: 83 }), NOW)!;
    expect(f.battery).toBe(83);
  });
});

describe('Rig payload normalizer — v2 compact array', () => {
  const compact = [
    { a: false, q: [1.0, 0.0, 0.0, 0.0] },
    { a: false, q: [s, s, 0.0, 0.0] },
    { a: false, q: [1.0, 0.0, 0.0, 0.0] },
    { a: true, q: [1.0, 0.0, 0.0, 0.0] },
    { a: false, q: [1.0, 0.0, 0.0, 0.0] },
  ];

  it('maps array positions onto the documented node order', () => {
    const f = parseRigPayload(JSON.stringify(compact), NOW)!;
    expect(f.protocol).toBe('v2-array');
    expect(f.nodes.map((n) => n.id)).toEqual(RIG_NODE_ORDER);
    // index 3 is rightArm and it is the alerting one
    expect(f.nodes[3]!.id).toBe('rightArm');
    expect(f.nodes[3]!.alert).toBe(true);
    expect(f.flags.alert).toBe(true);
  });

  it('reads q as scalar-first (r,i,j,k), matching the named form', () => {
    const f = parseRigPayload(JSON.stringify(compact), NOW)!;
    const leftArm = f.nodes[1]!;
    expect(leftArm.id).toBe('leftArm');
    expect(leftArm.quat![0]).toBeCloseTo(s, 5); // r
    expect(leftArm.quat![1]).toBeCloseTo(s, 5); // i
  });

  it('carries the same information as the named form', () => {
    const named = parseRigPayload(
      JSON.stringify({
        back: { a: false, q: { r: 1, i: 0, j: 0, k: 0 } },
        leftArm: { a: false, q: { r: s, i: s, j: 0, k: 0 } },
        leftLeg: { a: false, q: { r: 1, i: 0, j: 0, k: 0 } },
        rightArm: { a: true, q: { r: 1, i: 0, j: 0, k: 0 } },
        rightLeg: { a: false, q: { r: 1, i: 0, j: 0, k: 0 } },
      }),
      NOW,
    )!;
    const array = parseRigPayload(JSON.stringify(compact), NOW)!;
    const key = (f: typeof named) =>
      [...f.nodes]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((n) => `${n.id}:${n.alert}:${n.quat?.map((x) => x.toFixed(4)).join(',')}`);
    expect(key(array)).toEqual(key(named));
  });

  it('tolerates Python booleans in the compact form too', () => {
    const f = parseRigPayload("[{'a':False,'q':[1.0,0.0,0.0,0.0]}]", NOW)!;
    expect(f.nodes[0]!.id).toBe('back');
    expect(f.nodes[0]!.alert).toBe(false);
  });
});

describe('the earlier key spelling still parses', () => {
  // A rig in the field may be running firmware from before the rename. The
  // failure mode of dropping it would be indistinguishable from dead
  // hardware, which is the worst possible thing to debug in a gym.
  it('reads alert/quaternions in the named form', () => {
    const f = parseRigPayload(
      JSON.stringify({
        back: { alert: false, quaternions: { r: 1, i: 0, j: 0, k: 0 } },
        rightArm: { alert: true, quaternions: { r: s, i: s, j: 0, k: 0 } },
      }),
      NOW,
    )!;
    expect(f.protocol).toBe('v2-named');
    expect(f.nodes).toHaveLength(2);
    expect(f.nodes.find((n) => n.id === 'rightArm')!.alert).toBe(true);
    expect(f.flags.alert).toBe(true);
  });

  it('reads alert in the compact form', () => {
    const f = parseRigPayload(JSON.stringify([{ alert: true, q: [1, 0, 0, 0] }]), NOW)!;
    expect(f.nodes[0]!.alert).toBe(true);
  });

  it('gives the same frame under either spelling', () => {
    const short = parseRigPayload(
      JSON.stringify({ back: { a: true, q: { r: s, i: s, j: 0, k: 0 } } }),
      NOW,
    )!;
    const long = parseRigPayload(
      JSON.stringify({ back: { alert: true, quaternions: { r: s, i: s, j: 0, k: 0 } } }),
      NOW,
    )!;
    expect(short.nodes).toEqual(long.nodes);
    expect(short.flags).toEqual(long.flags);
  });

  it('tells a named quaternion from a packed one by its shape, not its key', () => {
    // `q` is an object here and an array in the compact form; both must land
    // on the same numbers rather than one being mistaken for the other
    const asObject = parseRigPayload(
      JSON.stringify({ back: { a: false, q: { r: s, i: 0, j: s, k: 0 } } }),
      NOW,
    )!;
    const asArray = parseRigPayload(JSON.stringify([{ a: false, q: [s, 0, s, 0] }]), NOW)!;
    expect(asObject.nodes[0]!.quat).toEqual(asArray.nodes[0]!.quat);
  });
});

describe('Rig payload normalizer — legacy formats stay supported', () => {
  it('parses the original v0 single-angle payload onto the back node', () => {
    const f = parseRigPayload('{"angle": 41.7, "alert": true}', NOW)!;
    expect(f.protocol).toBe('v0');
    expect(f.nodes[0]).toEqual({ id: 'back', angleDeg: 41.7, alert: true });
    expect(f.flags.alert).toBe(true);
  });

  it('parses v1 nodes[] and remaps the old "spine" id to "back"', () => {
    const f = parseRigPayload(
      JSON.stringify({ v: 1, nodes: [{ id: 'spine', q: [0, 0, 0, 1] }], batt: 83 }),
      NOW,
    )!;
    expect(f.protocol).toBe('v1');
    expect(f.nodes[0]!.id).toBe('back');
    expect(f.battery).toBe(83);
  });

  it('reads v1 quaternions scalar-last, as the original brief specified', () => {
    // [i,j,k,r] with r last → normalized to scalar-first
    const f = parseRigPayload(JSON.stringify({ v: 1, nodes: [{ id: 'spine', q: [s, 0, 0, s] }] }), NOW)!;
    expect(f.nodes[0]!.quat![0]).toBeCloseTo(s, 5); // r moved to front
    expect(f.nodes[0]!.quat![1]).toBeCloseTo(s, 5); // i
  });
});

describe('Rig payload normalizer — hostile input never throws', () => {
  it.each([
    ['garbage', 'not json at all'],
    ['truncated', '{"back": {"alert": fal'],
    ['empty', ''],
    ['array root of scalars', '[1,2,3]'],
    ['unknown keys only', '{"foo": 1, "bar": 2}'],
    ['node with no usable field', '{"back": {}}'],
    ['quaternion of strings', '{"back":{"quaternions":{"r":"1","i":"0","j":"0","k":"0"}}}'],
    ['named q of strings', '{"back":{"q":{"r":"1","i":"0","j":"0","k":"0"}}}'],
    ['named q missing a component', '{"back":{"q":{"r":1,"i":0,"j":0}}}'],
    ['quaternion with NaN', '{"back":{"q":[1e999,0,0,0]}}'],
    ['degenerate zero quaternion', '{"back":{"q":[0,0,0,0]}}'],
    ['nodes not an array', '{"v":1,"nodes":5}'],
    ['null root', 'null'],
    ['bare number', '42'],
  ])('rejects %s', (_name, payload) => {
    expect(parseRigPayload(payload, NOW)).toBeNull();
  });

  it('drops a corrupt quaternion without dropping the alert beside it', () => {
    // the firmware's fault flag is the one field that can stop a set on its
    // own authority, so a garbled orientation must not take it down with it —
    // but it must also not become a body position
    const f = parseRigPayload('{"back":{"a":true,"q":{"r":"1","i":"0","j":"0","k":"0"}}}', NOW)!;
    expect(f).not.toBeNull();
    expect(f.nodes[0]!.quat).toBeUndefined();
    expect(f.nodes[0]!.alert).toBe(true);
    expect(f.flags.alert).toBe(true);
  });

  it('rejects oversized payloads and entry floods', () => {
    expect(parseRigPayload('x'.repeat(9000), NOW)).toBeNull();
    const flood = JSON.stringify(Array.from({ length: 40 }, () => ({ alert: false, q: [1, 0, 0, 0] })));
    expect(parseRigPayload(flood, NOW)).toBeNull();
  });

  it('ignores unknown segment names rather than trusting them', () => {
    const f = parseRigPayload(
      JSON.stringify({
        back: { a: false, q: { r: 1, i: 0, j: 0, k: 0 } },
        tail: { a: true, q: { r: 1, i: 0, j: 0, k: 0 } },
      }),
      NOW,
    )!;
    expect(f.nodes).toHaveLength(1);
    expect(f.nodes[0]!.id).toBe('back');
    // the bogus node's alert must not leak into the frame
    expect(f.flags.alert).toBe(false);
  });

  it('never lets a prototype-polluting key through', () => {
    const f = parseRigPayload('{"__proto__":{"alert":true},"back":{"q":[1,0,0,0]}}', NOW)!;
    expect(f.nodes).toHaveLength(1);
    expect(({} as Record<string, unknown>).alert).toBeUndefined();
  });

  it('accepts raw bytes as well as strings', () => {
    const bytes = new TextEncoder().encode('{"back":{"alert":false,"q":[1,0,0,0]}}');
    const f = parseRigPayload(bytes, NOW)!;
    expect(f.nodes[0]!.id).toBe('back');
  });

  it('normalizes non-unit quaternions instead of trusting the scale', () => {
    const f = parseRigPayload('{"back":{"q":[0.8,0.8,0,0]}}', NOW)!;
    const n = Math.hypot(...f.nodes[0]!.quat!);
    expect(n).toBeCloseTo(1, 6);
  });
});

describe('quatPitchDeg matches the prototype firmware', () => {
  it('folds past vertical the way display_angle does', () => {
    expect(quatPitchDeg([1, 0, 0, 0])).toBeCloseTo(0, 3);
    expect(quatPitchDeg([s, s, 0, 0])).toBeCloseTo(90, 3);
    expect(quatPitchDeg([Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0, 0])).toBeCloseTo(60, 1);
  });
});
