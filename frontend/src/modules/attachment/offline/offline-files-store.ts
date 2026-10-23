import { appConfig } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { idbKvStorage } from '~/query/idb-kv-storage';

/** How much of the organizations' files this device keeps for offline use, in slider order. */
export const offlineFilesTiers = ['off', 'previews', 'recent', 'all'] as const;
export type OfflineFilesTier = (typeof offlineFilesTiers)[number];

export interface OfflineFilesRules {
  /** Thumbnail and preview variants. */
  previews: boolean;
  /** The file as the viewer shows it: the converted variant, else the original. */
  files: boolean;
  /** Bytes the downloads may take on this device; the newest attachments are kept. */
  budget: number;
}

const megabyte = 1024 * 1024;

const tierRules: Record<OfflineFilesTier, OfflineFilesRules> = {
  off: { previews: false, files: false, budget: 0 },
  previews: { previews: true, files: false, budget: 50 * megabyte },
  recent: { previews: true, files: true, budget: 250 * megabyte },
  all: { previews: true, files: true, budget: Number.POSITIVE_INFINITY },
};

/** What a tier keeps; `localBlobStorage.maxTotalSize` caps every budget. */
export const offlineFilesRules = (tier: OfflineFilesTier): OfflineFilesRules => {
  const rules = tierRules[tier];
  return { ...rules, budget: Math.min(rules.budget, appConfig.localBlobStorage.maxTotalSize) };
};

/** A touch device keeps previews only until its user picks more: phones have less room and often pay for data. */
export const defaultOfflineFilesTier = (): OfflineFilesTier =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 'previews' : 'recent';

interface OfflineFilesState {
  /** Null until the user picks a tier on this device; `defaultOfflineFilesTier` applies meanwhile. */
  tier: OfflineFilesTier | null;
  setTier: (tier: OfflineFilesTier) => void;
  reset: () => void;
}

export const useOfflineFilesStore = create<OfflineFilesState>()(
  persist(
    (set) => ({
      tier: null,
      setTier: (tier) => set({ tier }),
      reset: () => set({ tier: null }),
    }),
    {
      version: 1,
      name: 'offline-files',
      skipHydration: true,
      partialize: ({ tier }) => ({ tier }),
      storage: createJSONStorage(() => idbKvStorage('offline-files')),
    },
  ),
);

export { useOfflineFilesStore as offlineFilesStore };

/** The tier the download service works to now. */
export const currentOfflineFilesTier = (): OfflineFilesTier => useOfflineFilesStore.getState().tier ?? defaultOfflineFilesTier();
