import { execSync } from 'child_process';
import { rigBodyState, rigMetrics, RigCalibration } from '@/src/engine/rigBody';
import { parseRigPayload } from '@/src/sources/udp/protocol';

/** Capture what the emulator actually puts on the wire. */
function emit(flags: string): string {
  const out = execSync(`node scripts/send-test-packet.js 127.0.0.1 ${flags}`, { encoding: 'utf8' });
  return out.slice(out.indexOf('{') >= 0 && (out.indexOf('{') < out.indexOf('[') || out.indexOf('[') < 0)
    ? out.indexOf('{')
    : out.indexOf('[')).trim();
}

describe('emulator → parser → body model, end to end', () => {
  it.each([['named', ''], ['compact', '--compact'], ['legacy', '--legacy']])(
    'the %s form the emulator sends is understood by the app',
    (_name, flags) => {
      const wire = emit(flags);
      const frame = parseRigPayload(wire, 1000);
      expect(frame).not.toBeNull();
      expect(frame!.nodes.length).toBeGreaterThan(0);
    },
    30000,
  );

  it('the five-node forms place a real body with real joint angles', () => {
    for (const flags of ['', '--compact']) {
      const frame = parseRigPayload(emit(flags), 1000)!;
      expect(frame.nodes).toHaveLength(5);
      const m = rigMetrics(rigBodyState(frame, new RigCalibration()));
      // mid-squat: trunk inclined, hip closed well past standing, sides even
      expect(m.torsoLean!).toBeGreaterThan(10);
      expect(m.hipAngle!).toBeLessThan(170);
      expect(m.symmetry!).toBeGreaterThan(90);
      // no sensor spans the knee or elbow — the model must not invent them
      expect(m).not.toHaveProperty('kneeAngle');
    }
  }, 30000);
});
