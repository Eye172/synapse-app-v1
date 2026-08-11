import { create } from 'zustand';

/** Rig link state shown by the connection chip (§2.3). */
export type LinkMode = 'linked' | 'searching' | 'offline';

export interface ConnectionState {
  mode: LinkMode;
  /** nodes currently reporting */
  nodeCount: number;
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
