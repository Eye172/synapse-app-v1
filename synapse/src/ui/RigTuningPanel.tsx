import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { MOUNT_AXES, RigCalibration, rigBodyState, type MountAxis } from '@/src/engine/rigBody';
import type { SensorFrame } from '@/src/engine/types';
import { rigLink } from '@/src/sources/udp/rigLink';
import type { RawPacket } from '@/src/sources/udp/UdpSensorSource';
import { useSettingsStore } from '@/src/store/settingsStore';
import { color, radius, space } from '@/src/theme/tokens';

import { AppText } from './AppText';
import { Chip } from './Chip';
import { HUDFrame, hudTint } from './HUDFrame';
import { PressableScale } from './PressableScale';

/**
 * Everything needed to make a real Rig work, on the phone.
 *
 * Two conventions cannot be derived from a spec — how the firmware packs its
 * quaternions, and which way the boards sit in their straps. Rather than ship
 * a guess and require a rebuild when it is wrong, both are adjustable here,
 * with the live segment directions right underneath so the effect of a change
 * is visible immediately: stand upright, and BACK should read y ≈ +1 with the
 * limbs at y ≈ −1.
 *
 * The raw packet log below is the other half: a packet that arrives but does
 * not parse is otherwise invisible, and "silent" versus "talking but
 * misunderstood" are entirely different problems.
 */
export function RigTuningPanel() {
  const scalarLast = useSettingsStore((s) => s.rigQuatScalarLast);
  const segmentAxis = useSettingsStore((s) => s.rigSegmentAxis);
  const setSetting = useSettingsStore((s) => s.set);

  const [frame, setFrame] = useState<SensorFrame | null>(null);
  const [raw, setRaw] = useState<readonly RawPacket[]>([]);
  const [rejected, setRejected] = useState(0);

  // poll rather than subscribe: this panel is diagnostic, and a steady 4 Hz
  // refresh is easier to read than a 10 Hz flicker
  useEffect(() => {
    const tick = () => {
      const src = rigLink.active;
      if (!src) return;
      setRaw([...src.recentPackets]);
      setRejected(src.rejected);
    };
    const unsub = rigLink.active?.onFrame((f) => setFrame(f));
    const timer = setInterval(tick, 250);
    tick();
    return () => {
      unsub?.();
      clearInterval(timer);
    };
  }, []);

  const state = frame ? rigBodyState(frame, new RigCalibration()) : null;
  // only the packed array form is ambiguous about component order
  const quatOrderApplies = frame?.protocol === 'v2-array';

  return (
    <View style={{ gap: space.sm }}>
      <HUDFrame tint={hudTint.mesh} style={{ gap: 10 }}>
        <AppText variant="nano" color={color.textLo}>
          HARDWARE CONVENTIONS — CHANGE HERE, NOT IN A REBUILD
        </AppText>

        <View style={{ gap: 5 }}>
          <AppText variant="nano" color={color.textMid}>
            COMPACT `q` ORDER
          </AppText>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[false, true].map((v) => (
              <PressableScale
                key={String(v)}
                onPress={() => setSetting({ rigQuatScalarLast: v })}
                accessibilityRole="button"
                accessibilityLabel={v ? 'Scalar last' : 'Scalar first'}
              >
                <Chip
                  label={v ? '[i,j,k,r]' : '[r,i,j,k]'}
                  tint={scalarLast === v ? color.acid : color.textLo}
                  filled={scalarLast === v}
                />
              </PressableScale>
            ))}
          </View>
          {/* This setting only means anything for the packed array form. A
              named quaternion says which component is which, so the toggle
              cannot change how it is read — and a tester pressing an inert
              button concludes the app is broken rather than that the setting
              does not apply. */}
          <AppText variant="nano" color={quatOrderApplies ? color.textLo : color.warn}>
            {frame === null
              ? 'APPLIES ONLY TO THE PACKED ARRAY FORM'
              : quatOrderApplies
                ? 'THIS RIG SENDS PACKED ARRAYS — THIS SETTING APPLIES'
                : 'THIS RIG SENDS NAMED {R,I,J,K} — THIS SETTING DOES NOTHING HERE'}
          </AppText>
        </View>

        <View style={{ gap: 5 }}>
          <AppText variant="nano" color={color.textMid}>
            SENSOR AXIS ALONG THE SEGMENT
          </AppText>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {MOUNT_AXES.map((a: MountAxis) => (
              <PressableScale
                key={a}
                onPress={() => setSetting({ rigSegmentAxis: a })}
                accessibilityRole="button"
                accessibilityLabel={`Segment axis ${a}`}
              >
                <Chip label={a.toUpperCase()} tint={segmentAxis === a ? color.acid : color.textLo} filled={segmentAxis === a} />
              </PressableScale>
            ))}
          </View>
        </View>

        {/* live effect of the settings above */}
        <View style={{ gap: 2, marginTop: 2 }}>
          <AppText variant="nano" color={color.textLo}>
            STAND UPRIGHT — BACK SHOULD READ Y≈+1, LIMBS Y≈−1
          </AppText>
          {state && Object.keys(state.segments).length > 0 ? (
            (Object.keys(state.segments) as (keyof typeof state.segments)[]).map((id) => {
              const seg = state.segments[id]!;
              const upright = id === 'back' ? seg.dir.y > 0.8 : seg.dir.y < -0.8;
              return (
                <AppText key={id} variant="monoBody" color={upright ? color.ok : color.textMid}>
                  {`${String(id).padEnd(9)} (${seg.dir.x.toFixed(2)}, ${seg.dir.y.toFixed(2)}, ${seg.dir.z.toFixed(2)})`}
                </AppText>
              );
            })
          ) : (
            <AppText variant="monoBody" color={color.textLo}>
              no oriented nodes yet
            </AppText>
          )}
        </View>
      </HUDFrame>

      <HUDFrame tint={rejected > 0 ? hudTint.error : hudTint.dim} style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="nano" color={color.textLo}>
            RAW PACKETS
          </AppText>
          {rejected > 0 ? (
            <AppText variant="nano" color={color.error}>
              {`${rejected} NOT UNDERSTOOD`}
            </AppText>
          ) : null}
        </View>
        {raw.length === 0 ? (
          <AppText variant="monoBody" color={color.textLo}>
            nothing has arrived on :1234 yet
          </AppText>
        ) : (
          raw.slice(0, 4).map((p, i) => (
            <View
              key={`${p.t}-${i}`}
              style={{
                borderLeftWidth: 2,
                borderLeftColor: p.parsed ? color.ok : color.error,
                paddingLeft: 8,
                paddingVertical: 2,
                borderRadius: radius.hudSm,
              }}
            >
              <AppText variant="monoBody" color={p.parsed ? color.textMid : color.error} numberOfLines={3}>
                {p.text}
              </AppText>
            </View>
          ))
        )}
      </HUDFrame>
    </View>
  );
}
