import { Redirect, Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { RIG_SUPPORTED } from '@/src/sources/udp/rigSupport';
import { useSettingsStore } from '@/src/store/settingsStore';
import { color } from '@/src/theme/tokens';
import { TabBar } from '@/src/ui/TabBar';

export default function TabsLayout() {
  // wait for the persisted settings before deciding on first-run —
  // a returning user must never see a flash of onboarding
  const [hydrated, setHydrated] = useState(useSettingsStore.persist.hasHydrated());
  const onboardingDone = useSettingsStore((s) => s.onboardingDone);

  useEffect(() => {
    const unsub = useSettingsStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: color.void }} />;
  }
  // first run is about putting the Rig on; a browser has no Rig to put on
  if (!onboardingDone && RIG_SUPPORTED) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      // mount tabs on first visit: four screens of live canvases at launch is
      // memory and cold-start cost the user never asked for
      screenOptions={{ headerShown: false, lazy: true }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
