import { create } from 'zustand';

/** Rig link state shown by the connection chip (§2.3). */
export type LinkMode = 'linked' | 'searching' | 'offline';

export interface ConnectionState {
  mode: LinkMode;
  /**
   * Nodes currently reporting a usable orientation. This is the number the
   * chip shows, so it counts only sensors that are actually measuring.
   */
  nodeCount: number;
  /**
   * Nodes the last packet carried at all, reading or not.
   *
   * A rig that is powered and transmitting but has no fix yet sends five
   * nodes and five zeroed quaternions. Counting those as "5/5 nodes" would
   * report a working rig that measures nothing — so the two counts are kept
   * apart, and the screens say "heard, not reading" when they differ.
   */
  nodesHeard: number;
  /** measured sensor frame rate, Hz */
  hz: number;
  /** last battery report, 0-100 */
  battery: number | null;
  /** rig display name (kit manager) */
  rigName: string;
  set: (p: Partial<Omit<ConnectionState, 'set'>>) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  mode: 'offline',
  nodeCount: 0,
  nodesHeard: 0,
  hz: 0,
  battery: null,
  rigName: 'Synapse Rig',
  set: (p) => set(p),
}));

export const LINK_LABEL: Record<LinkMode, string> = {
  linked: 'LINKED',
  searching: 'SEARCHING',
  offline: 'OFFLINE',
};
