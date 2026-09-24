import { NO_TELEMETRY, describeTelemetry, type CameraTelemetry } from './cameraTelemetry';

const READY: CameraTelemetry = {
  camera: 'ready',
  detector: 'ready',
  detail: 'GPU',
  posesPerSec: 24,
  latencyMs: 31.4,
  canRecord: true,
};

describe('describeTelemetry — one line for each place the camera path can stop', () => {
  it('reports a working path with its rate and latency', () => {
    expect(describeTelemetry(READY, true)).toEqual({
      text: 'CAM READY · DETECTOR GPU · 24 POSE/S · 31 MS',
      tone: 'ok',
    });
  });

  it('says the camera is still starting', () => {
    expect(describeTelemetry(NO_TELEMETRY, true)).toEqual({ text: 'CAMERA STARTING…', tone: 'ok' });
  });

  it('warns, with the reason, when the camera failed', () => {
    const line = describeTelemetry({ ...READY, camera: 'failed', detail: 'camera in use by another app' }, true);
    expect(line.tone).toBe('warn');
    expect(line.text).toBe('CAMERA FAILED — camera in use by another app');
  });

  it('warns when the build has no detector, rather than looking fine', () => {
    const line = describeTelemetry({ ...READY, detector: 'none', detail: '' }, true);
    expect(line).toEqual({ text: 'CAM READY · NO DETECTOR IN THIS BUILD', tone: 'warn' });
  });

  it('carries the reason a detector could not start', () => {
    const line = describeTelemetry({ ...READY, detector: 'unavailable', detail: 'CPU: model missing' }, true);
    expect(line).toEqual({ text: 'CAM READY · DETECTOR OFF — CPU: model missing', tone: 'warn' });
  });

  it('shows the detector loading as progress, not a fault', () => {
    expect(describeTelemetry({ ...READY, detector: 'loading', detail: '' }, true).tone).toBe('ok');
  });

  /** MediaPipe only reports frames with a body in them, so zero means nobody seen. */
  it('warns when the detector runs but finds nobody', () => {
    const line = describeTelemetry({ ...READY, posesPerSec: 0, latencyMs: null }, true);
    expect(line).toEqual({ text: 'CAM READY · DETECTOR GPU · NO BODY IN FRAME', tone: 'warn' });
  });

  it('does not blame the frame when the Rig is drawing the body', () => {
    const line = describeTelemetry({ ...READY, posesPerSec: 0, latencyMs: null }, false);
    expect(line.tone).toBe('ok');
    expect(line.text).toContain('IDLE');
    expect(line.text).not.toContain('NO BODY');
  });

  it('says when this camera cannot record alongside detection', () => {
    expect(describeTelemetry({ ...READY, canRecord: false }, true).text).toMatch(/NO RECORDER$/);
  });

  it('keeps a long driver message to one readable line', () => {
    const reason = 'GPU: ' + 'x'.repeat(200) + '; CPU: also failed';
    const line = describeTelemetry({ ...READY, detector: 'unavailable', detail: reason }, true);
    expect(line.text.length).toBeLessThan(120);
    expect(line.text.endsWith('…')).toBe(true);
  });
});
