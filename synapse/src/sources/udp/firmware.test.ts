import { RIG_TARGET_IP, addressOf, holdsRigTarget } from './firmware';

/**
 * The Connect screen's verdict on whether the Rig can reach this phone at all.
 * Getting it wrong in either direction is expensive: a false yes sends the
 * tester hunting a phantom firmware fault, a false no sends them changing a
 * hotspot that was already correct.
 */

describe('can the Rig reach this phone', () => {
  it('says yes when an interface holds the address the firmware targets', () => {
    expect(holdsRigTarget(['wlan0 192.168.10.184', `ap0 ${RIG_TARGET_IP}`])).toBe(true);
  });

  it('says no when the phone is only on someone else’s network', () => {
    // exactly the case that made the old screen misleading: the phone is
    // joined to home Wi-Fi and reports *that* address, which says nothing
    // about whether the hotspot exists
    expect(holdsRigTarget(['wlan0 192.168.10.184'])).toBe(false);
  });

  it('says no with no interfaces at all', () => {
    expect(holdsRigTarget([])).toBe(false);
  });

  it('does not mistake a neighbouring address for the target', () => {
    // 192.168.43.10 shares a prefix with 192.168.43.1 and is a different
    // machine; a prefix match here would claim a link that receives nothing
    expect(holdsRigTarget(['ap0 192.168.43.10'])).toBe(false);
    expect(holdsRigTarget(['ap0 192.168.43.100'])).toBe(false);
    expect(holdsRigTarget(['ap0 92.168.43.1'])).toBe(false);
  });

  it('reads the address off an interface line', () => {
    expect(addressOf('swlan0 192.168.43.1')).toBe('192.168.43.1');
    expect(addressOf('192.168.43.1')).toBe('192.168.43.1');
    expect(addressOf('  rmnet_data0 10.51.2.9  ')).toBe('10.51.2.9');
  });
});
