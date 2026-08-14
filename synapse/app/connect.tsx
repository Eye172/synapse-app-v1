import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buzz } from '@/src/coach/haptics';
import { RIG_NODE_IDS, type RigNodeId, type SensorFrame, type SensorNode } from '@/src/engine/types';
import { RIG_HOTSPOT_PASSWORD, RIG_HOTSPOT_SSID } from '@/src/sources/udp/firmware';
import { rigLink, calibrateNeutral } from '@/src/sources/udp/rigLink';
import { RIG_UDP_PORT } from '@/src/sources/udp/UdpSensorSource';
import { useConnectionStore } from '@/src/store/connectionStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { color, space } from '@/src/theme/tokens';
import { useThemeMode } from '@/src/theme/useThemeMode';
import { AppText } from '@/src/ui/AppText';
import { Chip } from '@/src/ui/Chip';
import { GlassCard } from '@/src/ui/GlassCard';
import { GridBackdrop } from '@/src/ui/GridBackdrop';
import { HUDFrame, hudTint } from '@/src/ui/HUDFrame';
import { PhoneAddress } from '@/src/ui/PhoneAddress';
import { PressableScale } from '@/src/ui/PressableScale';
import { PrimaryButton } from '@/src/ui/PrimaryButton';
import { StatReadout } from '@/src/ui/StatReadout';

type WizardStep = 'unavailable' | 'searching' | 'found' | 'calibrating' | 'linked';

const NODE_LABEL: Record<RigNodeId, string> = {
  back: 'BACK',
  leftArm: 'ARM · L',
  rightArm: 'ARM · R',
  leftLeg: 'LEG · L',
  rightLeg: 'LEG · R',
};

/**
 * A value the phone has to match exactly, shown as something to copy rather
 * than something to decide. These are compiled into the Rig — presenting them
 * as advice is what makes people "improve" them and then wonder why nothing
 * connects.
 */
function Credential({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <AppText variant="nano" color={color.textLo}>
        {label}
      </AppText>
      <AppText variant="monoBody" color={color.acid} selectable>
        {value}
      </AppText>
    </View>
  );
}

/**
 * Connect wizard (§2.4-A, §2.9): the phone opens a hotspot named "Synapse",
 * the Rig's nodes join it and stream UDP to :1234. SEARCHING → NODES FOUND →
 * CALIBRATE → LINKED.
 */
export default function ConnectScreen() {
  useThemeMode(); // repaint this screen when the ground changes
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mode = useConnectionStore((s) => s.mode);
  const nodeCount = useConnectionStore((s) => s.nodeCount);
  const hz = useConnectionStore((s) => s.hz);
  const battery = useConnectionStore((s) => s.battery);
  const calNodes = useSettingsStore((s) => Object.keys(s.rigCalibration).length);

  const [step, setStep] = useState<WizardStep>('searching');
  const [liveNodes, setLiveNodes] = useState<SensorNode[]>([]);
  const [alertFlag, setAlertFlag] = useState(false);
  const [calProgress, setCalProgress] = useState(0);
  const [calError, setCalError] = useState<string | null>(null);
  const calibrated = calNodes > 0;
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!rigLink.available()) {
      setStep('unavailable');
      return undefined;
    }
    const src = rigLink.start();
    if (!src) {
      setStep('unavailable');
      return undefined;
    }
    unsubRef.current = src.onFrame((f: SensorFrame) => {
      setLiveNodes(f.nodes);
      setAlertFlag(f.flags.alert === true);
    });
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
      // keep the link itself alive if it made it to LINKED — the chip stays truthful
      if (useConnectionStore.getState().mode !== 'linked') {
        rigLink.stop();
      }
    };
  }, []);

  // step follows the real link state
  useEffect(() => {
    if (step === 'unavailable' || step === 'calibrating') return;
    if (mode === 'linked') setStep(calibrated ? 'linked' : 'found');
    else if (mode === 'searching') setStep('searching');
  }, [mode, calibrated, step]);

  const startCalibration = async () => {
    const src = rigLink.active;
    if (!src) return;
    setStep('calibrating');
    setCalError(null);
    setCalProgress(0);
    const res = await calibrateNeutral(src, { onProgress: (p) => setCalProgress(p) });
    if (res.ok) {
      buzz('lock');
      setStep('linked');
    } else {
      setCalError(res.reason ?? 'Not enough frames — is the Rig still streaming?');
      setStep('found');
    }
  };

  const stepIndex = { unavailable: 0, searching: 1, found: 2, calibrating: 3, linked: 4 }[step];

  return (
    <View style={{ flex: 1 }}>
      <GridBackdrop grid={false} />
      <ScrollView
        contentContainerStyle={{ padding: space.gutter, paddingTop: insets.top + space.md, gap: space.sm, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="nano" color={color.acid}>
            · RIG LINK ·
          </AppText>
          <Chip
            label={mode.toUpperCase()}
            tint={mode === 'linked' ? color.acid : mode === 'searching' ? color.warn : color.blue}
          />
        </View>
        <AppText variant="h1">Connect the Rig</AppText>

        {/* step rail */}
        <View style={{ flexDirection: 'row', gap: 6, marginVertical: 2 }}>
          {(['SEARCH', 'NODES', 'CALIBRATE', 'LINKED'] as const).map((label, i) => {
            const active = stepIndex >= i + 1;
            return (
              <View key={label} style={{ flex: 1, gap: 4 }}>
                <View style={{ height: 3, borderRadius: 2, backgroundColor: active ? color.acid : color.line }} />
                <AppText variant="nano" color={active ? color.acid : color.textLo}>
                  {label}
                </AppText>
              </View>
            );
          })}
        </View>

        {step === 'unavailable' ? (
          <>
            <HUDFrame tint={hudTint.blue} style={{ gap: 8 }}>
              <AppText variant="nano" color={color.blue}>
                · SENSOR LINK UNAVAILABLE HERE ·
              </AppText>
              <AppText variant="body">
                This copy of the app is running in a sandbox that cannot open a network socket. Install the released app on your phone and the Rig connects normally.
              </AppText>
            </HUDFrame>
            <PrimaryButton title="Back" onPress={() => router.back()} />
          </>
        ) : (
          <>
            <HUDFrame tint={step === 'linked' ? hudTint.acid : hudTint.mesh} style={{ gap: 12 }}>
              <AppText variant="nano" color={color.textLo}>
                LIVE LINK · UDP :{RIG_UDP_PORT}
              </AppText>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <StatReadout k="NODES" v={`${nodeCount}/5`} tint={nodeCount > 0 ? color.acid : color.textLo} />
                <StatReadout k="RATE" v={hz > 0 ? String(hz) : '—'} unit={hz > 0 ? 'HZ' : undefined} tint={color.mesh} />
                <StatReadout k="BATT" v={battery === null ? '—' : String(battery)} unit={battery === null ? undefined : '%'} tint={color.textHi} />
              </View>

              {/* every mount point, live — the fastest way to spot a dead strap */}
              <View style={{ gap: 4 }}>
                {RIG_NODE_IDS.map((id) => {
                  const node = liveNodes.find((n) => n.id === id);
                  const reporting = node !== undefined;
                  const faulted = node?.alert === true;
                  return (
                    <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 3,
                          backgroundColor: faulted ? color.error : reporting ? color.mesh : color.lineStrong,
                        }}
                      />
                      <AppText variant="nano" color={reporting ? color.textMid : color.textLo} style={{ width: 74 }}>
                        {NODE_LABEL[id]}
                      </AppText>
                      <AppText variant="nano" color={faulted ? color.error : reporting ? color.mesh : color.textLo}>
                        {faulted ? 'ALERT' : reporting ? 'REPORTING' : 'SILENT'}
                      </AppText>
                    </View>
                  );
                })}
              </View>

              {alertFlag ? (
                <AppText variant="nano" color={color.error}>
                  ⚠ A NODE IS FLAGGING — THE FIRMWARE SEES A BAD ANGLE
                </AppText>
              ) : null}
            </HUDFrame>

            {step === 'searching' ? (
              <GlassCard style={{ gap: 8 }}>
                <AppText variant="nano" color={color.warn}>
                  SEARCHING — WAITING FOR THE FIRST PACKET
                </AppText>
                <AppText variant="body">
                  The Rig looks for one exact network and sends to one exact address. All three are
                  compiled into it — set your hotspot to match, character for character.
                </AppText>

                <View style={{ gap: 6 }}>
                  <Credential label="HOTSPOT NAME" value={RIG_HOTSPOT_SSID} />
                  <Credential label="HOTSPOT PASSWORD" value={RIG_HOTSPOT_PASSWORD} />
                </View>

                <PhoneAddress />

                <AppText variant="body">
                  Then power the Rig — it joins on its own. Nothing to pair, nothing leaves the phone.
                </AppText>

                {/* Still nothing is the hard case: the Rig failing to join the
                    network and the Rig joining but shouting at the wrong
                    address look identical from in here. The phone's own
                    hotspot screen tells them apart in one glance, so point at
                    it rather than leaving the tester to guess. */}
                <View style={{ gap: 3, marginTop: 2 }}>
                  <AppText variant="nano" color={color.textLo}>
                    STILL SILENT? OPEN THE PHONE’S HOTSPOT SCREEN AND COUNT CONNECTED DEVICES
                  </AppText>
                  <AppText variant="nano" color={color.textMid}>
                    NONE → THE RIG NEVER JOINED · CHECK THE NAME AND PASSWORD ABOVE
                  </AppText>
                  <AppText variant="nano" color={color.textMid}>
                    ONE → IT JOINED BUT ITS PACKETS LAND ELSEWHERE · CHECK THE ADDRESS ABOVE
                  </AppText>
                </View>
              </GlassCard>
            ) : null}

            {step === 'found' ? (
              <GlassCard style={{ gap: 8 }}>
                <AppText variant="nano" color={color.acid}>
                  NODES FOUND ({nodeCount})
                </AppText>
                <AppText variant="body">
                  The Rig is streaming. Now zero it: stand tall and neutral — bar down, back straight — and hold for
                  three seconds.
                </AppText>
                {calError ? (
                  <AppText variant="nano" color={color.error}>
                    {calError.toUpperCase()}
                  </AppText>
                ) : null}
                <PrimaryButton title="Calibrate" sub="HOLD NEUTRAL · 3S" onPress={startCalibration} />
              </GlassCard>
            ) : null}

            {step === 'calibrating' ? (
              <GlassCard style={{ gap: 10, alignItems: 'center', paddingVertical: space.lg }}>
                <AppText variant="nano" color={color.mesh}>
                  CALIBRATING — HOLD STILL
                </AppText>
                <AppText variant="display" color={color.mesh} style={{ fontSize: 36, lineHeight: 40 }}>
                  {`${Math.round(calProgress * 100)}%`}
                </AppText>
                <View style={{ width: '80%', height: 4, borderRadius: 2, backgroundColor: color.line, overflow: 'hidden' }}>
                  <View style={{ width: `${calProgress * 100}%`, height: 4, backgroundColor: color.mesh }} />
                </View>
              </GlassCard>
            ) : null}

            {step === 'linked' ? (
              <GlassCard style={{ gap: 8 }}>
                <AppText variant="nano" color={color.acid}>
                  LINKED · CALIBRATED
                </AppText>
                <AppText variant="body">
                  {`Neutral reference locked on ${calNodes} node${calNodes === 1 ? '' : 's'}. The Rig now draws your body and grades every joint it spans — trunk, hips and shoulders — with no camera required.`}
                </AppText>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton title="Done" compact onPress={() => router.back()} />
                  </View>
                  <PressableScale
                    onPress={startCalibration}
                    accessibilityRole="button"
                    accessibilityLabel="Re-calibrate"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    <View
                      style={{
                        paddingVertical: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: color.lineStrong,
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="bodySemi" color={color.textMid}>
                        RE-CALIBRATE
                      </AppText>
                    </View>
                  </PressableScale>
                </View>
                <PressableScale
                  onPress={() => {
                    rigLink.stop();
                    router.back();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Disconnect rig"
                >
                  <AppText variant="micro" color={color.textLo} align="center" style={{ paddingVertical: 6 }}>
                    DISCONNECT
                  </AppText>
                </PressableScale>
              </GlassCard>
            ) : null}

            {step !== 'linked' ? (
              <PressableScale onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Set up later">
                <AppText variant="micro" color={color.textMid} align="center" style={{ paddingVertical: 8 }}>
                  SET UP LATER
                </AppText>
              </PressableScale>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
