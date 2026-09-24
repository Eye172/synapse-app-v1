import {
  RIG_NODE_ORDER,
  isRigNodeId,
  type NodeReadingFault,
  type RigNodeId,
  type SensorFrame,
  type SensorNode,
} from '@/src/engine/types';

/**
 * Rig payload normalizer (§2.9). Every inbound byte is untrusted: malformed
 * JSON, wrong types, NaN, oversized arrays and hostile keys are all rejected
 * without throwing — a bad packet must never reach the grader or the UI.
 *
 * Four wire formats are accepted, newest first:
 *
 *  v2-packed {"back":[r,i,j,k], "leftArm":[…], "leftLeg":[…],
 *             "rightArm":[…], "rightLeg":[…]}   ← current firmware
 *
 *  v2-named  {"back":{"a":false,"q":{"r":0,"i":0,"j":0,"k":0}},
 *             "leftArm":{…},"leftLeg":{…},"rightArm":{…},"rightLeg":{…}}
 *
 *  v2-array  [{"a":false,"q":[r,i,j,k]}, …]   ← 5 entries, RIG_NODE_ORDER
 *
 *  v1        {"v":1,"nodes":[{"id":"spine","q":[i,j,k,r]}],"batt":83}
 *  v0        {"angle":41.7,"alert":true}
 *
 * Both v2 forms carry the same information; the array form is the compact one
 * and its element order is positional, so RIG_NODE_ORDER is the contract.
 *
 * The packed form carries the quaternion and nothing else — it has no fault
 * flag at all. Every earlier spelling is still read (`a`/`alert`,
 * `q`/`quaternions`), because a rig in the field may be running any of them
 * and a silent mismatch looks exactly like dead hardware. None of them can be
 * confused: a node value that is an array is the packed quaternion, a node
 * value that is an object holds named fields, and within those, `q` as an
 * object is the named quaternion while `q` as an array is the packed one.
 */

const MAX_PAYLOAD_BYTES = 4096;
const MAX_ARRAY_ENTRIES = 16;
/** BNO08x quaternions are unit; anything far off is a corrupt read. */
const QUAT_NORM_MIN = 0.5;
const QUAT_NORM_MAX = 2;

/**
 * Component order of the compact `q` array. The firmware's named form lists
 * its fields as (r, i, j, k), so the packed form follows that same order.
 * If a future firmware packs scalar-last, flip this one constant.
 */
export const V2_QUAT_ORDER = ['r', 'i', 'j', 'k'] as const;
/** The v1 payload in the original brief packed the scalar last. */
const V1_QUAT_SCALAR_LAST = true;

/**
 * Runtime override for the compact form's component order. Firmware that
 * packs the scalar last flips this from the Sensor setup screen — no rebuild,
 * which matters when the only person holding the hardware is in a gym.
 * Named quaternions (`{r,i,j,k}`) are unambiguous and ignore it.
 */
let v2ScalarLast = false;

export function setV2QuatScalarLast(scalarLast: boolean): void {
  v2ScalarLast = scalarLast;
}

export function getV2QuatScalarLast(): boolean {
  return v2ScalarLast;
}

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Accepts real booleans; tolerates the Python reprs a raw str(dict) would emit. */
function readBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 'True') return true;
  if (v === 'false' || v === 'False') return false;
  return undefined;
}

/**
 * MicroPython's `str(dict)` produces `False`/`True`/`None` and single quotes —
 * close enough to JSON that firmware sometimes ships it by accident. Repair
 * those two cases rather than dropping otherwise-valid sensor data on the
 * floor; anything still unparseable is rejected normally.
 */
function parseLenient(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // fall through to the repair attempt
  }
  if (!/[FTN']/.test(text)) return undefined;
  const repaired = text
    .replace(/'/g, '"')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bNone\b/g, 'null');
  try {
    return JSON.parse(repaired);
  } catch {
    return undefined;
  }
}

/**
 * A quaternion field that was present, read either way it can go.
 *
 * `undefined` from the readers below means "this was not a quaternion at
 * all" so the next spelling can be tried; a `fault` means "this *was* the
 * quaternion and it is not usable", which is a different thing and has to
 * survive as far as the UI.
 */
type QuatRead =
  | { quat: [number, number, number, number]; fault?: undefined }
  | { quat?: undefined; fault: NodeReadingFault };

/**
 * Validate + normalize a quaternion into scalar-first (r, i, j, k).
 *
 * An all-zero reading is singled out from other bad norms because it is not
 * corruption: it is what a BNO08x reports before it has a fix, and a rig
 * that has just been powered on sends nothing else. Telling the wearer
 * "the back sensor has no fix yet" is useful; telling them "malformed
 * packet" — or, worse, saying nothing at all — is not.
 */
function readQuatArray(raw: unknown, scalarLast: boolean): QuatRead | undefined {
  if (!Array.isArray(raw) || raw.length !== 4 || !raw.every(finite)) return undefined;
  const a = raw as [number, number, number, number];
  const q: [number, number, number, number] = scalarLast ? [a[3], a[0], a[1], a[2]] : [a[0], a[1], a[2], a[3]];
  const norm = Math.hypot(q[0], q[1], q[2], q[3]);
  if (norm === 0) return { fault: 'zero' };
  if (!(norm > QUAT_NORM_MIN && norm < QUAT_NORM_MAX)) return { fault: 'denormal' };
  return { quat: [q[0] / norm, q[1] / norm, q[2] / norm, q[3] / norm] };
}

/** Named `{"r":…,"i":…,"j":…,"k":…}` form. */
function readQuatObject(raw: unknown): QuatRead | undefined {
  if (!isObject(raw)) return undefined;
  const { r, i, j, k } = raw;
  if (!finite(r) || !finite(i) || !finite(j) || !finite(k)) return undefined;
  return readQuatArray([r, i, j, k], false);
}

/**
 * Reads a node's quaternion however it is spelled: `q` as an object is the
 * named form, `q` as an array is the packed one, and `quaternions` is the
 * earlier revision's longer key. Object and array can't collide, so trying
 * each in turn is unambiguous rather than a guess.
 */
function readNodeQuat(entry: Record<string, unknown>): QuatRead | undefined {
  return (
    readQuatObject(entry.q) ?? readQuatObject(entry.quaternions) ?? readQuatArray(entry.q, v2ScalarLast)
  );
}

/**
 * Apply a quaternion read to a node. Orientation and fault are mutually
 * exclusive by construction, so the UI never has to decide which to believe.
 */
function applyQuat(node: SensorNode, read: QuatRead | undefined): void {
  if (read?.quat) node.quat = read.quat;
  else if (read?.fault) node.fault = read.fault;
}

/** Reads a node's fault flag under either spelling. */
function readNodeAlert(entry: Record<string, unknown>): boolean | undefined {
  return readBool(entry.a) ?? readBool(entry.alert);
}

function decode(raw: string | Uint8Array): string | undefined {
  if (typeof raw === 'string') {
    return raw.length > 0 && raw.length <= MAX_PAYLOAD_BYTES ? raw : undefined;
  }
  if (raw.byteLength === 0 || raw.byteLength > MAX_PAYLOAD_BYTES) return undefined;
  try {
    return new TextDecoder().decode(raw);
  } catch {
    return undefined;
  }
}

export function parseRigPayload(raw: string | Uint8Array, now: number): SensorFrame | null {
  const text = decode(raw);
  if (text === undefined) return null;

  const obj = parseLenient(text);
  if (obj === undefined || obj === null) return null;

  // ---- v2 compact array: [{alert, q:[r,i,j,k]} × 5] ----
  if (Array.isArray(obj)) {
    if (obj.length === 0 || obj.length > MAX_ARRAY_ENTRIES) return null;
    const nodes: SensorNode[] = [];
    let anyAlert = false;
    for (let idx = 0; idx < obj.length && idx < RIG_NODE_ORDER.length; idx++) {
      const entry = obj[idx];
      if (!isObject(entry)) continue;
      const read = readNodeQuat(entry);
      const alert = readNodeAlert(entry);
      if (read === undefined && alert === undefined) continue;
      const node: SensorNode = { id: RIG_NODE_ORDER[idx]! };
      applyQuat(node, read);
      if (alert !== undefined) {
        node.alert = alert;
        anyAlert = anyAlert || alert;
      }
      nodes.push(node);
    }
    if (nodes.length === 0) return null;
    return { t: now, nodes, flags: { alert: anyAlert }, protocol: 'v2-array' };
  }

  if (!isObject(obj)) return null;

  // ---- v2 named, packed or spelled out ----
  //   packed:  {"back":[r,i,j,k], …}        ← the node value IS the quaternion
  //   spelled: {"back":{"a":…,"q":…}, …}
  const namedKeys = Object.keys(obj).filter(
    (k) => isRigNodeId(k) && (isObject(obj[k]) || Array.isArray(obj[k])),
  );
  if (namedKeys.length > 0) {
    const nodes: SensorNode[] = [];
    let anyAlert = false;
    // a frame is "packed" only if every node it carries arrived that way;
    // the label drives the diagnostics screen, so it must not overstate
    let packedNodes = 0;
    for (const key of namedKeys) {
      const raw = obj[key];
      const packed = Array.isArray(raw);
      // the packed form is a bare array, so it is exactly as ambiguous about
      // component order as the compact form and obeys the same runtime toggle
      const read = packed ? readQuatArray(raw, v2ScalarLast) : readNodeQuat(raw as Record<string, unknown>);
      const alert = packed ? undefined : readNodeAlert(raw as Record<string, unknown>);
      if (read === undefined && alert === undefined) continue;
      const node: SensorNode = { id: key as RigNodeId };
      applyQuat(node, read);
      if (alert !== undefined) {
        node.alert = alert;
        anyAlert = anyAlert || alert;
      }
      if (packed) packedNodes += 1;
      nodes.push(node);
    }
    if (nodes.length === 0) return null;
    const frame: SensorFrame = {
      t: now,
      nodes,
      flags: { alert: anyAlert },
      protocol: packedNodes === nodes.length ? 'v2-packed' : 'v2-named',
    };
    if (finite(obj.batt) && obj.batt >= 0 && obj.batt <= 100) frame.battery = obj.batt;
    return frame;
  }

  // ---- v1: {"v":1,"nodes":[{id,q}],"batt"} ----
  if (Array.isArray(obj.nodes)) {
    const list = obj.nodes;
    if (list.length === 0 || list.length > MAX_ARRAY_ENTRIES) return null;
    const nodes: SensorNode[] = [];
    let anyAlert = false;
    for (const entry of list) {
      if (!isObject(entry)) continue;
      const rawId = typeof entry.id === 'string' ? entry.id : '';
      // the original single-node firmware called the back node "spine"
      const id: RigNodeId | null = rawId === 'spine' ? 'back' : isRigNodeId(rawId) ? rawId : null;
      if (id === null) continue;
      const node: SensorNode = { id };
      const read = readQuatObject(entry.quaternions) ?? readQuatArray(entry.q, V1_QUAT_SCALAR_LAST);
      applyQuat(node, read);
      if (finite(entry.angle)) node.angleDeg = clampAngle(entry.angle);
      if (finite(entry.angleDeg)) node.angleDeg = clampAngle(entry.angleDeg as number);
      const alert = readBool(entry.alert);
      if (alert !== undefined) {
        node.alert = alert;
        anyAlert = anyAlert || alert;
      }
      if (
        node.quat === undefined &&
        node.fault === undefined &&
        node.angleDeg === undefined &&
        alert === undefined
      ) {
        continue;
      }
      nodes.push(node);
    }
    if (nodes.length === 0) return null;
    const topAlert = readBool(obj.alert);
    const frame: SensorFrame = {
      t: now,
      nodes,
      flags: { alert: topAlert ?? anyAlert },
      protocol: 'v1',
    };
    if (finite(obj.batt) && obj.batt >= 0 && obj.batt <= 100) frame.battery = obj.batt;
    return frame;
  }

  // ---- v0: {"angle":41.7,"alert":true} ----
  if (finite(obj.angle)) {
    const alert = readBool(obj.alert);
    const node: SensorNode = { id: 'back', angleDeg: clampAngle(obj.angle) };
    if (alert !== undefined) node.alert = alert;
    return {
      t: now,
      nodes: [node],
      flags: alert === undefined ? {} : { alert },
      protocol: 'v0',
    };
  }

  return null;
}

function clampAngle(n: number): number {
  return Math.max(-360, Math.min(360, n));
}

/**
 * Pitch from a quaternion, matching the prototype firmware's own derivation
 * (see materials/base/main.py) so v0 and v2 spine readings share a scale.
 */
export function quatPitchDeg([qr, qi, qj, qk]: readonly [number, number, number, number]): number {
  const pitch = Math.atan2(2.0 * (qr * qi + qj * qk), 1.0 - 2.0 * (qi * qi + qj * qj)) * (180 / Math.PI);
  const a = Math.abs(pitch);
  return a < 90 ? a : 180 - a;
}
