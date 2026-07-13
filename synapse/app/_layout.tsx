import { DarkTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { color } from '@/src/theme/tokens';
import { fontMap } from '@/src/theme/typography';
import { purgeStaleClips } from '@/src/train/recording';

SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden — fine */
});

const hudTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: color.acid,
    background: color.void,
    card: color.base,
    text: color.textHi,
    border: color.hairlineDim,
    notification: color.acid,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontMap);

  // no recording ever survives a session — even across a process kill (§2.12)
  useEffect(() => {
    void purgeStaleClips();
  }, []);

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
        <ThemeProvider value={hudTheme}>
          <StatusBar style="light" backgroundColor={color.void} />
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
            <Stack.Screen name="dev" options={{ animation: 'slide_from_right' }} />
          </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
