import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import RigUdp from '@/modules/rig-udp';
import { RIG_TARGET_IP, holdsRigTarget } from '@/src/sources/udp/firmware';
import { RIG_UDP_PORT } from '@/src/sources/udp/UdpSensorSource';
import { color } from '@/src/theme/tokens';

import { AppText } from './AppText';

/**
 * Can the Rig's packets actually land on this phone?
 *
 * The firmware sends to one fixed address and nowhere else, so this is a yes
 * or no question — and it is the question that decides whether anything else
 * on the Connect screen matters. The platform's own "what is my IP" answer
 * cannot settle it: on a phone that is joined to Wi-Fi *and* hosting the
 * hotspot it names the home network, which looks like a wrong address when
 * the hotspot is in fact fine. So every interface is checked.
 */
export function PhoneAddress() {
  const [addresses, setAddresses] = useState<string[] | null>(null);

  useEffect(() => {
    if (RigUdp === null) return;
    const read = () => {
      try {
        setAddresses(RigUdp!.addresses());
      } catch {
        setAddresses([]);
      }
    };
    read();
    // the hotspot is often switched on after this screen is already open
    const timer = setInterval(read, 2000);
    return () => clearInterval(timer);
  }, []);

  if (RigUdp === null) {
    return (
      <View style={{ gap: 3 }}>
        <AppText variant="nano" color={color.textLo}>
          THE RIG SENDS HERE
        </AppText>
        <AppText variant="monoBody" color={color.textLo}>
          {`${RIG_TARGET_IP}:${RIG_UDP_PORT}`}
        </AppText>
        <AppText variant="nano" color={color.textLo}>
          INSTALL THE APP ON A PHONE TO CHECK THIS
        </AppText>
      </View>
    );
  }

  const reachable = addresses !== null && holdsRigTarget(addresses);
  const tint = addresses === null ? color.textLo : reachable ? color.ok : color.warn;

  return (
    <View style={{ gap: 3 }}>
      <AppText variant="nano" color={color.textLo}>
        THE RIG SENDS HERE — FIXED IN FIRMWARE
      </AppText>
      <AppText variant="monoBody" color={tint}>
        {`${RIG_TARGET_IP}:${RIG_UDP_PORT}`}
      </AppText>

      {addresses === null ? null : reachable ? (
        <AppText variant="nano" color={color.ok}>
          THIS PHONE HOLDS THAT ADDRESS — PACKETS CAN ARRIVE
        </AppText>
      ) : (
        <View style={{ gap: 3, marginTop: 2 }}>
          <AppText variant="nano" color={color.warn}>
            THIS PHONE DOES NOT HOLD THAT ADDRESS
          </AppText>
          <AppText variant="nano" color={color.textLo}>
            {addresses.length > 0 ? 'IT HOLDS:' : 'NO NETWORK — TURN THE HOTSPOT ON'}
          </AppText>
          {addresses.map((a) => (
            <AppText key={a} variant="monoBody" color={color.textMid} style={{ fontSize: 12 }}>
              {a}
            </AppText>
          ))}
          <AppText variant="nano" color={color.textLo}>
            THE RIG CANNOT REACH THIS PHONE UNTIL ONE OF THESE IS {RIG_TARGET_IP}
          </AppText>
        </View>
      )}
    </View>
  );
}
