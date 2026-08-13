import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

/**
 * The Rig's UDP receiver. A thin, deliberate surface: bind a port, hear
 * datagrams, close. The app never sends, so there is nothing here to send
 * with.
 *
 * `requireOptionalNativeModule` returns null wherever the native side does not
 * exist — the web preview and Expo Go — so callers can report the link as
 * unavailable instead of crashing on import.
 */

export interface RigUdpMessage {
  /** the datagram decoded as UTF-8 text */
  data: string;
  /** sender's address, for diagnostics */
  address: string;
  port: number;
}

export interface RigUdpError {
  message: string;
}

type RigUdpEvents = {
  onMessage: (event: RigUdpMessage) => void;
  onError: (event: RigUdpError) => void;
};

declare class RigUdpNativeModule extends NativeModule<RigUdpEvents> {
  /** Start listening. Rejects if the port cannot be opened. */
  bind(port: number): Promise<void>;
  /** Release the socket. Safe to call when nothing is bound. */
  close(): Promise<void>;
  /**
   * Every IPv4 address this phone holds, as `"<interface> <address>"` — e.g.
   * `"wlan0 192.168.10.184"`, `"ap0 192.168.43.1"`. A phone hosting a hotspot
   * while joined to Wi-Fi holds both, and only one of them is the one the Rig
   * can reach.
   */
  addresses(): string[];
}
export type { RigUdpNativeModule };

const RigUdp = requireOptionalNativeModule<RigUdpNativeModule>('RigUdp');

/** null when this build has no native receiver (web, Expo Go). */
export default RigUdp;
