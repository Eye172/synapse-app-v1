import { Platform } from 'react-native';

// On web, Skia must load its CanvasKit WASM before the app renders any canvas.
// Native platforms go straight to the router entry.
if (Platform.OS === 'web') {
  const { LoadSkiaWeb } = require('@shopify/react-native-skia/lib/module/web');
  LoadSkiaWeb({ locateFile: () => '/canvaskit.wasm' })
    .then(() => require('expo-router/entry'))
    .catch((err) => {
      console.error('[synapse] CanvasKit failed to load; starting without Skia web', err);
      require('expo-router/entry');
    });
} else {
  require('expo-router/entry');
}
