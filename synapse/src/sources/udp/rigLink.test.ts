import { useConnectionStore } from '@/src/store/connectionStore';
import { useSettingsStore } from '@/src/store/settingsStore';

import { FakeRigUdp, flush } from './fakeRigUdp';
import { rigLink } from './rigLink';

/**
 * The app-wide link manager: when it opens the socket on its own, and what it
 * tells the screens. The socket itself is covered in nativeSocket.test.ts.
 */

const mockRigUdp = new FakeRigUdp();

jest.mock('@/modules/rig-udp', () => ({
  __esModule: true,
  get default() {
    return mockRigUdp;
  },
}));

describe('rigLink', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRigUdp.reset();
  });

  afterEach(() => {
    rigLink.stop();
    useSettingsStore.getState().set({ rigCalibration: {} });
    jest.useRealTimers();
  });

  it('opens no socket at launch on a phone that never calibrated a Rig', async () => {
    rigLink.autoStart();
    await flush();
    expect(rigLink.active).toBeNull();
    expect(mockRigUdp.binds).toHaveLength(0);
  });

  it('starts listening at launch for a Rig this phone was calibrated with', async () => {
    useSettingsStore.getState().set({ rigCalibration: { back: [1, 0, 0, 0] } });
    rigLink.autoStart();
    await flush();
    expect(rigLink.active).not.toBeNull();
    expect(mockRigUdp.binds).toHaveLength(1);
    expect(useConnectionStore.getState().mode).toBe('searching');
  });

  it('puts packets that arrive but cannot be read on the screen', async () => {
    rigLink.start();
    await flush();

    mockRigUdp.emit('onMessage', { data: 'not a rig', address: '192.168.43.77', port: 4000 });
    mockRigUdp.emit('onMessage', { data: '{"nope":1}', address: '192.168.43.77', port: 4000 });
    jest.advanceTimersByTime(1000);

    const s = useConnectionStore.getState();
    // still searching — nothing was understood — but visibly not silent
    expect(s.mode).toBe('searching');
    expect(s.packets).toBe(2);
    expect(s.rejected).toBe(2);
    expect(s.lastSender).toBe('192.168.43.77');
  });

  it('reports a socket that cannot listen, and clears it on stop', async () => {
    rigLink.start();
    await flush();
    mockRigUdp.emit('onError', { message: 'EADDRINUSE' });
    jest.advanceTimersByTime(1000);
    expect(useConnectionStore.getState().linkError).toBe('EADDRINUSE');

    rigLink.stop();
    expect(useConnectionStore.getState().linkError).toBeNull();
    expect(useConnectionStore.getState().mode).toBe('offline');
  });
});
