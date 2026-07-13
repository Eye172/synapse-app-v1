import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { glow } from '@/src/theme/glow';
import { color } from '@/src/theme/tokens';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { TabGlyph, type GlyphName } from './TabGlyph';

const TAB_META: Record<string, { title: string; glyph: GlyphName }> = {
  index: { title: 'Home', glyph: 'home' },
  library: { title: 'Library', glyph: 'library' },
  progress: { title: 'Progress', glyph: 'progress' },
  profile: { title: 'Profile', glyph: 'profile' },
};

/**
 * Glass tab bar with the raised acid TRAIN control in the center (§2.3).
 * TRAIN is not a tab — it launches the full-screen training modal.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const renderTab = (route: (typeof state.routes)[number], index: number) => {
    const meta = TAB_META[route.name] ?? { title: route.name, glyph: 'home' as GlyphName };
    const focused = state.index === index;
    const tint = focused ? color.acid : color.textLo;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.title}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 10, gap: 5 }}
      >
        <View style={focused ? glow(color.acid, 9, 0.8, 0) : undefined}>
          <TabGlyph name={meta.glyph} tint={tint} size={19} />
        </View>
        <AppText variant="nano" color={tint}>
          {meta.title}
        </AppText>
        <View
          style={{
            width: 14,
            height: 2,
            borderRadius: 1,
            backgroundColor: focused ? color.acid : 'transparent',
          }}
        />
      </Pressable>
    );
  };

  const left = state.routes.slice(0, 2);
  const right = state.routes.slice(2);

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: Math.max(insets.bottom, 8),
        backgroundColor: 'rgba(8,10,15,0.94)',
        borderTopWidth: 1,
        borderTopColor: color.hairline,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'stretch', height: 58 }}>
        {left.map((r) => renderTab(r, state.routes.indexOf(r)))}

        {/* raised TRAIN control */}
        <View style={{ width: 84, alignItems: 'center' }}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Start training"
            onPress={() => router.push('/train')}
            style={{ marginTop: -26 }}
          >
            <View
              style={[
                {
                  width: 62,
                  height: 62,
                  borderRadius: 18,
                  backgroundColor: color.acid,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.25)',
                },
                glow(color.acid, 22, 0.6, 10),
              ]}
            >
              <TabGlyph name="bolt" tint={color.inkOnAcid} size={22} />
              <AppText variant="nano" color={color.inkOnAcid} style={{ marginTop: 2, fontFamily: 'JetBrainsMono_700Bold' }}>
                TRAIN
              </AppText>
            </View>
          </PressableScale>
        </View>

        {right.map((r) => renderTab(r, state.routes.indexOf(r)))}
      </View>
    </View>
  );
}
