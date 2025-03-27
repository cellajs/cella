import type { Offset } from '@electric-sql/client';
import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

type SyncData = { offset: Offset; handle: string };

interface SyncStoreState {
  syncData: Record<string, SyncData>;

  setSyncData: (key: string, data: SyncData) => void; // Saves or updates a SyncData
  getSyncData: (key: string) => SyncData | undefined; // Retrieves a specific SyncData
  removeSyncData: (key: string) => void; // Removes a specific SyncData
}

export const useSyncStore = create<SyncStoreState>()(
  devtools(
    persist(
      immer((set, get) => ({
        syncData: {},

        setSyncData: (key, data) =>
          set((state) => {
            state.syncData[key] = data;
          }),

        getSyncData: (key) => get().syncData[key],

        removeSyncData: (key) => set((state) => delete state.syncData[key]),
      })),
      {
        version: 1,
        name: `${config.slug}-sync-data-store`,
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
