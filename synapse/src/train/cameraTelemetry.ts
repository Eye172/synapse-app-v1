/**
 * What the camera is doing, in one line a tester can read off the screen.
 *
 * The camera path has five places it can stop — the camera, the detector, the
 * poses arriving, the tracker, the fit — and from the outside all five look
 * the same: no figure. With no cable and no log, the only way to know which
 * one is to have the screen say. This is that sentence, kept apart from the
 * view so every branch of it can be tested.
 */

export interface CameraTelemetry {
  camera: 'starting' | 'ready' | 'failed';
  /** 'none' when this build carries no detector at all */
  detector: 'loading' | 'ready' | 'unavailable' | 'none';
  /** the delegate when ready ('GPU' | 'CPU'); the reason when not */
  detail: string;
  /** poses delivered in the last second — only frames with a body in them */
  posesPerSec: number;
  /** mean detector latency over that second, or null with no poses */
  latencyMs: number | null;
  canRecord: boolean;
}

export const NO_TELEMETRY: CameraTelemetry = {
  camera: 'starting',
  detector: 'loading',
  detail: '',
  posesPerSec: 0,
  latencyMs: null,
  canRecord: false,
};

export interface TelemetryLine {
  text: string;
  /** 'warn' when something the wearer needs is not working */
  tone: 'ok' | 'warn';
}

/** Long enough to carry a GPU driver's reason, short enough for one line. */
const DETAIL_MAX = 64;

function clip(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > DETAIL_MAX ? `${t.slice(0, DETAIL_MAX - 1)}…` : t;
}

/**
 * @param detecting whether this set measures from the camera at all — with the
 *   Rig drawing the body the detector is deliberately idle, and saying "no body
 *   in frame" then would send a tester looking for a problem that is not there
 */
export function describeTelemetry(t: CameraTelemetry, detecting: boolean): TelemetryLine {
  if (t.camera === 'failed') {
    return { text: `CAMERA FAILED${t.detail ? ` — ${clip(t.detail)}` : ''}`, tone: 'warn' };
  }
  if (t.camera === 'starting') return { text: 'CAMERA STARTING…', tone: 'ok' };

  const rec = t.canRecord ? '' : ' · NO RECORDER';

  if (t.detector === 'none') return { text: `CAM READY · NO DETECTOR IN THIS BUILD${rec}`, tone: 'warn' };
  if (t.detector === 'unavailable') {
    return { text: `CAM READY · DETECTOR OFF${t.detail ? ` — ${clip(t.detail)}` : ''}${rec}`, tone: 'warn' };
  }
  if (t.detector === 'loading') return { text: `CAM READY · DETECTOR LOADING…${rec}`, tone: 'ok' };

  const hw = t.detail ? ` ${t.detail.toUpperCase()}` : '';
  if (!detecting) return { text: `CAM READY · DETECTOR${hw} IDLE — NOT THE POSE SOURCE${rec}`, tone: 'ok' };
  if (t.posesPerSec <= 0) return { text: `CAM READY · DETECTOR${hw} · NO BODY IN FRAME${rec}`, tone: 'warn' };

  const latency = t.latencyMs === null ? '' : ` · ${Math.round(t.latencyMs)} MS`;
  return { text: `CAM READY · DETECTOR${hw} · ${t.posesPerSec} POSE/S${latency}${rec}`, tone: 'ok' };
}
