import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { color } from '@/src/theme/tokens';
import { useThemeMode } from '@/src/theme/useThemeMode';
import { fontMap } from '@/src/theme/typography';
import { watchRigConfig } from '@/src/sources/udp/rigConfig';
import { purgeStaleClips } from '@/src/train/recording';

SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden — fine */
});

/**
 * Built per render, not at import: the tokens are repainted in place when the
 * ground changes, and a theme object captured at module scope would keep
 * whichever palette happened to be active when this file was first loaded.
 */
function navigationTheme(mode: 'dark' | 'light'): Theme {
  const base = mode === 'light' ? DefaultTheme : DarkTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: color.acid,
      background: color.void,
      card: color.base,
      text: color.textHi,
      border: color.hairlineDim,
      notification: color.acid,
    },
  };
}

export default function RootLayout() {
  const themeMode = useThemeMode();
  const [fontsLoaded, fontError] = useFonts(fontMap);

  // no recording ever survives a session — even across a process kill (§2.12)
  useEffect(() => {
    void purgeStaleClips();
  }, []);

  // the Rig's hardware conventions are user-adjustable; keep the engine synced
  useEffect(() => watchRigConfig(), []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
    if (fontError) {
      console.error('[synapse] font load failed', fontError);
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    // splash is still covering; render the void so nothing white ever flashes
    return <View style={{ flex: 1, backgroundColor: color.void }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.void }}>
      <SafeAreaProvider>
        <ThemeProvider value={navigationTheme(themeMode)}>
          <StatusBar style={themeMode === 'light' ? 'dark' : 'light'} backgroundColor={color.void} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: color.void },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="train"
              options={{
                presentation: 'fullScreenModal',
                animation: 'fade_from_bottom',
                gestureEnabled: false,
              }}
            />
            <Stack.Screen name="connect" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="exercise/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="sensor-setup" options={{ animation: 'slide_from_right' }} />
          </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
