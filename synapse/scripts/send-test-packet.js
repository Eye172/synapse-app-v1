/**
 * Emulate the Rig over UDP — the fastest way to exercise the real link
 * without hardware.
 *
 *   node scripts/send-test-packet.js <phone-ip>                   one frame
 *   node scripts/send-test-packet.js <phone-ip> --stream          10 Hz squat cycle
 *   node scripts/send-test-packet.js <phone-ip> --stream --compact  array form
 *   node scripts/send-test-packet.js <phone-ip> --legacy           prototype {angle,alert}
 *
 * The streamed motion is a real squat: the trunk inclines while the thighs
 * rotate through the hinge, and one rep in four collapses a knee inward so
 * the grader, the red tint and the safety stop all fire.
 */
const dgram = require('dgram');

const args = process.argv.slice(2);
const host = args.find((a) => !a.startsWith('--')) ?? '192.168.43.1';
const stream = args.includes('--stream');
const compact = args.includes('--compact');
const legacy = args.includes('--legacy');
const PORT = 1234;

/** Node order of the compact array form — must match RIG_NODE_ORDER. */
const ORDER = ['back', 'leftArm', 'leftLeg', 'rightArm', 'rightLeg'];

/** Shortest-arc quaternion (r,i,j,k) rotating `from` onto `to`. */
function quatFromTo(from, to) {
  const n = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const a = n(from);
  const b = n(to);
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (dot > 0.999999) return [1, 0, 0, 0];
  if (dot < -0.999999) return [0, 1, 0, 0];
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const q = [1 + dot, c[0], c[1], c[2]];
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return q.map((x) => x / l);
}

const UP = [0, 1, 0];
const DOWN = [0, -1, 0];

/** One frame of a squat at cycle position 0..1, with an optional knee fault. */
function poseAt(cycle, faulted) {
  const depth = (1 - Math.cos(2 * Math.PI * cycle)) / 2; // 0 top → 1 bottom
  // trunk inclines forward as the hips sink
  const lean = depth * 0.55;
  const back = quatFromTo(UP, [0, Math.cos(lean), Math.sin(lean)]);
  // thighs rotate from vertical toward horizontal; a fault caves them inward
  const thigh = depth * 0.9;
  const cave = faulted ? depth * 0.45 : 0;
  const leftLeg = quatFromTo(DOWN, [-0.18 + cave, -Math.cos(thigh), Math.sin(thigh) * 0.4]);
  const rightLeg = quatFromTo(DOWN, [0.18 - cave, -Math.cos(thigh), Math.sin(thigh) * 0.4]);
  // arms hold the bar on the traps — near-static
  const leftArm = quatFromTo(DOWN, [-0.35, -0.9, -0.2]);
  const rightArm = quatFromTo(DOWN, [0.35, -0.9, -0.2]);
  return { back, leftArm, leftLeg, rightArm, rightLeg };
}

function buildPayload(cycle, faulted) {
  if (legacy) {
    const angle = 90 - ((1 - Math.cos(2 * Math.PI * cycle)) / 2) * 55;
    return { angle: Math.round(angle * 10) / 10, alert: angle < 45 };
  }
  const pose = poseAt(cycle, faulted);
  // the firmware flags a node when its own segment leaves tolerance
  const alertFor = (id) => (id === 'leftLeg' || id === 'rightLeg' ? faulted && cycle > 0.35 && cycle < 0.65 : false);

  if (compact) {
    return ORDER.map((id) => ({ alert: alertFor(id), q: pose[id].map((x) => Math.round(x * 10000) / 10000) }));
  }
  const out = {};
  for (const id of ORDER) {
    const [r, i, j, k] = pose[id].map((x) => Math.round(x * 10000) / 10000);
    out[id] = { alert: alertFor(id), quaternions: { r, i, j, k } };
  }
  return out;
}

const socket = dgram.createSocket('udp4');
function send(payload) {
  const buf = Buffer.from(JSON.stringify(payload));
  socket.send(buf, PORT, host, (err) => {
    if (err) console.error('send failed:', err.message);
  });
}

if (!stream) {
  const payload = buildPayload(0.5, false);
  send(payload);
  console.log(`→ ${host}:${PORT}`, JSON.stringify(payload));
  setTimeout(() => socket.close(), 300);
} else {
  const form = legacy ? 'legacy {angle,alert}' : compact ? 'v2 compact array' : 'v2 named object';
  console.log(`streaming a simulated squat (${form}) to ${host}:${PORT} — ctrl-c to stop`);
  let t = 0;
  let rep = 1;
  const REP_SECONDS = 4;
  const timer = setInterval(() => {
    t += 0.1;
    const cycle = (t % REP_SECONDS) / REP_SECONDS;
    if (cycle < 0.1 / REP_SECONDS) rep += 1;
    // every fourth rep caves a knee so the red tint and safety stop fire
    send(buildPayload(cycle, rep % 4 === 0));
  }, 100);
  process.on('SIGINT', () => {
    clearInterval(timer);
    socket.close();
    process.exit(0);
  });
}
