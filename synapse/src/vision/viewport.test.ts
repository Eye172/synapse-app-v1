import { containViewport, coverViewport, identityViewport, landmarksToScreen } from './viewport';

/**
 * Getting this wrong does not look like a bug. The figure simply sits a
 * little off the person, more so toward the edges, on some devices and not
 * others — which is exactly the kind of fault that ships.
 */

const SENSOR = { width: 960, height: 720 };   // a 4:3 camera
const PHONE = { width: 411, height: 914 };    // a tall phone
const TABLET = { width: 1024, height: 768 };

describe('coverViewport', () => {
  it('fills the screen and crops the overflow', () => {
    const vp = coverViewport(SENSOR, PHONE);
    expect(vp.scale).toBeCloseTo(PHONE.height / SENSOR.height, 9);
    // the frame is wider than the screen can show, so its edges fall outside
    expect(vp.toScreen(0, 0).x).toBeLessThan(0);
    expect(vp.toScreen(SENSOR.width, 0).x).toBeGreaterThan(PHONE.width);
    // and nothing is cropped vertically
    expect(vp.toScreen(0, 0).y).toBeCloseTo(0, 6);
    expect(vp.toScreen(0, SENSOR.height).y).toBeCloseTo(PHONE.height, 6);
  });

  it('keeps the centre of the frame at the centre of the screen', () => {
    for (const screen of [PHONE, TABLET, { width: 300, height: 300 }]) {
      const vp = coverViewport(SENSOR, screen);
      const c = vp.toScreen(SENSOR.width / 2, SENSOR.height / 2);
      expect(c.x).toBeCloseTo(screen.width / 2, 6);
      expect(c.y).toBeCloseTo(screen.height / 2, 6);
    }
  });

  it('uses one scale for both axes, so nothing is stretched', () => {
    const vp = coverViewport(SENSOR, PHONE);
    const a = vp.toScreen(100, 100);
    const b = vp.toScreen(200, 200);
    expect(b.x - a.x).toBeCloseTo(b.y - a.y, 9);
  });
});

describe('containViewport', () => {
  it('shows the whole frame and leaves the rest empty', () => {
    const vp = containViewport(SENSOR, PHONE);
    expect(vp.scale).toBeCloseTo(PHONE.width / SENSOR.width, 9);
    expect(vp.toScreen(0, 0).x).toBeCloseTo(0, 6);
    expect(vp.toScreen(SENSOR.width, 0).x).toBeCloseTo(PHONE.width, 6);
    // letterboxed above and below
    expect(vp.toScreen(0, 0).y).toBeGreaterThan(0);
  });
});

describe('mirroring', () => {
  it('flips across the screen, not the frame', () => {
    const vp = coverViewport(SENSOR, PHONE, true);
    const plain = coverViewport(SENSOR, PHONE, false);
    for (const [x, y] of [[0, 0], [480, 360], [960, 720]] as const) {
      expect(vp.toScreen(x, y).x).toBeCloseTo(PHONE.width - plain.toScreen(x, y).x, 6);
      expect(vp.toScreen(x, y).y).toBeCloseTo(plain.toScreen(x, y).y, 6);
    }
  });

  it('puts the left of the frame on the right of the screen', () => {
    const vp = coverViewport(SENSOR, PHONE, true);
    expect(vp.toScreen(0, 360).x).toBeGreaterThan(vp.toScreen(SENSOR.width, 360).x);
  });
});

describe('round trips', () => {
  it.each([
    ['cover', false], ['cover', true], ['contain', false], ['contain', true],
  ] as const)('%s, mirrored %p, comes back to where it started', (kind, mirrored) => {
    const vp = kind === 'cover'
      ? coverViewport(SENSOR, PHONE, mirrored)
      : containViewport(SENSOR, PHONE, mirrored);
    for (const [x, y] of [[0, 0], [123, 456], [959, 719]] as const) {
      const s = vp.toScreen(x, y);
      const f = vp.toFrame(s.x, s.y);
      expect(f.x).toBeCloseTo(x, 6);
      expect(f.y).toBeCloseTo(y, 6);
    }
  });
});

describe('degenerate inputs', () => {
  it('does not divide by a frame of no size', () => {
    const vp = coverViewport({ width: 0, height: 0 }, PHONE);
    expect(Number.isFinite(vp.scale)).toBe(true);
    expect(Number.isFinite(vp.toScreen(10, 10).x)).toBe(true);
  });

  it('maps a frame onto itself one for one', () => {
    const vp = identityViewport(SENSOR);
    expect(vp.toScreen(321, 123)).toEqual({ x: 321, y: 123 });
  });
});

describe('landmarksToScreen', () => {
  const frame = { width: 720, height: 1280 };
  const screen = { width: 1080, height: 2400 };

  it('lands a point where the preview shows it, crop included', () => {
    const vp = coverViewport(frame, screen, false);
    const [p] = landmarksToScreen([{ x: 0.5, y: 0.5, v: 1 }], vp);
    // the centre of the frame is the centre of the screen under a centred crop
    expect(p!.x).toBeCloseTo(0.5);
    expect(p!.y).toBeCloseTo(0.5);

    // the screen is narrower than the frame, so cover scales to the height
    // and crops the sides: the frame's left edge falls off-screen
    const [edge] = landmarksToScreen([{ x: 0, y: 0.5, v: 1 }], vp);
    expect(edge!.x).toBeLessThan(0);
  });

  /**
   * The front camera's preview is a mirror and its frames are not. Without
   * this, a wearer who steps to their right watches the skeleton step left.
   */
  it('follows the mirrored preview, so moving right moves the figure right', () => {
    const vp = coverViewport(frame, screen, true);
    const [left, right] = landmarksToScreen(
      [
        { x: 0.3, y: 0.5, v: 1 },
        { x: 0.7, y: 0.5, v: 1 },
      ],
      vp,
    );
    expect(left!.x).toBeGreaterThan(right!.x);
  });

  it('keeps everything but position, joint names and flags included', () => {
    const vp = coverViewport(frame, screen, true);
    const [p] = landmarksToScreen([{ x: 0.4, y: 0.6, z: -0.2, v: 0.7, est: true }], vp);
    expect(p!.z).toBe(-0.2);
    expect(p!.v).toBe(0.7);
    expect(p!.est).toBe(true);
  });

  it('round-trips through the viewport exactly', () => {
    const vp = coverViewport(frame, screen, true);
    const src = { x: 0.37, y: 0.81, v: 1 };
    const [p] = landmarksToScreen([src], vp);
    const back = vp.toFrame(p!.x * screen.width, p!.y * screen.height);
    expect(back.x / frame.width).toBeCloseTo(src.x);
    expect(back.y / frame.height).toBeCloseTo(src.y);
  });
});
