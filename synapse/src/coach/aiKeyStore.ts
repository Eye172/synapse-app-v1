import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { useSettingsStore } from '@/src/store/settingsStore';

/**
 * The optional Anthropic API key (§2.8): the user's own key, stored in the
 * device's secure enclave via expo-secure-store — never in plain settings,
 * never bundled, never sent anywhere except api.anthropic.com.
 * The web harness falls back to localStorage (dev only).
 */
const KEY_NAME = 'synapse.anthropic.key';

export async function getAiKey(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_NAME) : null;
    }
    return await SecureStore.getItemAsync(KEY_NAME);
  } catch {
    return null;
  }
}

export async function setAiKey(key: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        if (key) localStorage.setItem(KEY_NAME, key);
        else localStorage.removeItem(KEY_NAME);
      }
    } else if (key) {
      await SecureStore.setItemAsync(KEY_NAME, key);
    } else {
      await SecureStore.deleteItemAsync(KEY_NAME);
    }
    useSettingsStore.getState().set({ aiKeyPresent: key !== null && key.length > 0 });
  } catch (e) {
    console.warn('[synapse] key store write failed', e);
  }
}

/** Cheap key check: one Models API call, zero tokens. */
export async function verifyAiKey(key: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({
      apiKey: key,
      dangerouslyAllowBrowser: true, // the key is the user's own, on their own device
      maxRetries: 0,
      timeout: 8000,
    });
    await client.models.retrieve('claude-haiku-4-5');
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    return { ok: false, reason: msg.includes('401') ? 'Key rejected (401)' : msg.slice(0, 80) };
  }
}
