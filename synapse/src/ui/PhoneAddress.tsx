import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { RIG_UDP_PORT } from '@/src/sources/udp/UdpSensorSource';
import { color } from '@/src/theme/tokens';

import { AppText } from './AppText';

/**
 * Where the firmware should actually send.
 *
 * The Rig ships to `192.168.43.1:1234` — the classic Android hotspot gateway
 * — but plenty of phones hand out a different one (Xiaomi and Samsung
 * especially). The app itself listens on every interface, so it does not
 * care; the firmware does. Printing the real address turns a silent failure
 * into a thirty-second fix.
 */
export function PhoneAddress() {
  const [ip, setIp] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const Network = await import('expo-network');
        const addr = await Network.getIpAddressAsync();
        if (alive) setIp(addr ?? null);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const shown = ip ?? (failed ? null : null);

  return (
    <View style={{ gap: 3 }}>
      <AppText variant="nano" color={color.textLo}>
        POINT THE FIRMWARE HERE
      </AppText>
      <AppText variant="monoBody" color={shown ? color.mesh : color.textLo}>
        {shown ? `${shown}:${RIG_UDP_PORT}` : `<this phone>:${RIG_UDP_PORT}`}
      </AppText>
      <AppText variant="nano" color={color.textLo}>
        {shown
          ? 'IF THE RIG SENDS SOMEWHERE ELSE, NOTHING ARRIVES'
          : 'ADDRESS UNAVAILABLE — CHECK THE HOTSPOT SETTINGS SCREEN'}
      </AppText>
    </View>
  );
}
