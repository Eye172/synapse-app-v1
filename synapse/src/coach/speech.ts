import * as Speech from 'expo-speech';

import { useSettingsStore } from '@/src/store/settingsStore';

/**
 * Spoken cues — calm authority: slightly lowered rate, one utterance at a
 * time (a new cue interrupts the old one; stale corrections are worse than
 * none). Respects the voice setting; never throws.
 */
export function speakCue(text: string, opts: { urgent?: boolean } = {}): void {
  try {
    if (!useSettingsStore.getState().voiceOn) return;
    Speech.stop();
    Speech.speak(text, {
      rate: opts.urgent ? 1.0 : 0.92,
      pitch: 0.96,
      language: 'en-US',
    });
  } catch (e) {
    console.warn('[synapse] TTS unavailable', e);
  }
}

export function stopSpeech(): void {
  try {
    Speech.stop();
  } catch {
    // never let audio teardown crash a set
  }
}
