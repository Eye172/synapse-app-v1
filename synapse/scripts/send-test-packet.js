/**
 * Fire firmware-shaped UDP packets at the app — the §4 done-when probe:
 *   node scripts/send-test-packet.js <phone-ip> [--alert] [--angle 41.7] [--stream]
 *
 * With a phone on your hotspot running the dev build, `--stream` emulates a
 * live Rig at 10 Hz cycling through a hinge; a plain call sends one packet.
 */
const dgram = require('dgram');

const args = process.argv.slice(2);
const host = args.find((a) => !a.startsWith('--')) ?? '192.168.43.1';
const alert = args.includes('--alert');
const angleArg = args.indexOf('--angle');
const angle = angleArg >= 0 ? parseFloat(args[angleArg + 1]) : 41.7;
const stream = args.includes('--stream');
const PORT = 1234;

const socket = dgram.createSocket('udp4');

function send(payload) {
  const buf = Buffer.from(JSON.stringify(payload));
  socket.send(buf, PORT, host, (err) => {
    if (err) console.error('send failed:', err.message);
    else console.log(`→ ${host}:${PORT}`, JSON.stringify(payload));
  });
}

if (!stream) {
  send({ angle, alert });
  setTimeout(() => socket.close(), 300);
} else {
  console.log(`streaming a simulated hinge to ${host}:${PORT} — ctrl-c to stop`);
  let t = 0;
  setInterval(() => {
    t += 0.1;
    // slow hinge cycle: 90° upright … 30° folded, alert below 45 (firmware rule)
    const a = 60 + 30 * Math.cos(t * 0.8);
    send({ angle: Math.round(a * 10) / 10, alert: a < 45 });
  }, 100);
}
