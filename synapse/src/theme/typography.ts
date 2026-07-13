import {
  ChakraPetch_500Medium,
  ChakraPetch_600SemiBold,
  ChakraPetch_700Bold,
} from '@expo-google-fonts/chakra-petch';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';

/** Font map for expo-font's useFonts. Keys are the fontFamily names used app-wide. */
export const fontMap = {
  ChakraPetch_500Medium,
  ChakraPetch_600SemiBold,
  ChakraPetch_700Bold,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
};

/** Semantic families — use these, never raw font names. */
export const font = {
  /** Display / HUD headers. Uppercase, tight tracking. */
  display: 'ChakraPetch_700Bold',
  displayMed: 'ChakraPetch_600SemiBold',
  displayLight: 'ChakraPetch_500Medium',
  /** UI / body. */
  body: 'SpaceGrotesk_400Regular',
  bodyMed: 'SpaceGrotesk_500Medium',
  bodySemi: 'SpaceGrotesk_600SemiBold',
  bodyBold: 'SpaceGrotesk_700Bold',
  /** Mono — technical labels & live data. Uppercase, letter-spaced. */
  mono: 'JetBrainsMono_400Regular',
  monoMed: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const;
