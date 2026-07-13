import type { SensorFrame, SensorNode } from '@/src/engine/types';

/**
 * Rig payload normalizer (§2.9). Treats every inbound byte as untrusted:
 * malformed JSON, wrong types, NaN, oversized arrays — all rejected, never thrown.
 *
 * v0 (current firmware):  {"angle": 41.7, "alert": true}
 * v1 (forward-compatible): {"v":1,"t":...,"nodes":[{"id":"spine","q":[i,j,k,r]}],"batt":83}
 */

const MAX_NODES = 16;
const MAX_PAYLOAD_BYTES = 2048;
const ID_RE = /^[a-zA-Z0-9_-]{1,24}$/;

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function cleanAngle(n: number): number {
  // firmware folds to 0..90 today; accept a generous but bounded range
  return Math.max(-360, Math.min(360, n));
}

export function parseRigPayload(raw: string | Uint8Array, now: number): SensorFrame | null {
  let text: string;
  if (typeof raw === 'string') {
    text = raw;
  } else {
    if (raw.byteLength > MAX_PAYLOAD_BYTES) return null;
    try {
      text = new TextDecoder().decode(raw);
    } catch {
      return null;
    }
  }
  if (text.length === 0 || text.length > MAX_PAYLOAD_BYTES) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;

  // ---- v1: nodes[] present ----
  if (Array.isArray(o.nodes)) {
    if (o.nodes.length > MAX_NODES) return null;
    const nodes: SensorNode[] = [];
    for (const n of o.nodes) {
      if (typeof n !== 'object' || n === null) continue;
      const nn = n as Record<string, unknown>;
      if (typeof nn.id !== 'string' || !ID_RE.test(nn.id)) continue;
      const node: SensorNode = { id: nn.id };
      if (finite(nn.angle)) node.angleDeg = cleanAngle(nn.angle);
      if (finite(nn.angleDeg)) node.angleDeg = cleanAngle(nn.angleDeg as number);
      if (Array.isArray(nn.q) && nn.q.length === 4 && nn.q.every(finite)) {
        const q = nn.q as [number, number, number, number];
        const mag = Math.hypot(q[0], q[1], q[2], q[3]);
        if (mag > 0.5 && mag < 2) {
          node.quat = q;
          if (node.angleDeg === undefined) node.angleDeg = quatPitchDeg(q);
        }
      }
      if (node.angleDeg !== undefined || node.quat !== undefined) nodes.push(node);
    }
    if (nodes.length === 0) return null;
    const frame: SensorFrame = { t: now, nodes, flags: {} };
    if (typeof o.alert === 'boolean') frame.flags.alert = o.alert;
    if (finite(o.batt) && o.batt >= 0 && o.batt <= 100) frame.battery = o.batt;
    return frame;
  }

  // ---- v0: single spine angle ----
  if (finite(o.angle)) {
    const frame: SensorFrame = {
      t: now,
      nodes: [{ id: 'spine', angleDeg: cleanAngle(o.angle) }],
      flags: {},
    };
    if (typeof o.alert === 'boolean') frame.flags.alert = o.alert;
    return frame;
  }

  return null;
}

/** Pitch from quaternion, same convention as the firmware (see main.py). */
export function quatPitchDeg([qi, qj, qk, qr]: [number, number, number, number]): number {
  const pitch =
    Math.atan2(2.0 * (qr * qi + qj * qk), 1.0 - 2.0 * (qi * qi + qj * qj)) * (180 / Math.PI);
  const a = Math.abs(pitch);
  return a < 90 ? a : 180 - a;
}
