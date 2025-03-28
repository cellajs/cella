import type { Offset } from '@electric-sql/client';
import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

type SyncData = { offset: Offset; handle: string };

interface SyncStoreState {
  data: Record<string, SyncData>;

  setSyncData: (key: string, data: SyncData) => void; // Sets or updates sync data
  getKeysByPrefix: (prefix: string) => string[]; // Retrieves all sync keys with the given prefix
  getSyncData: (key: string) => SyncData | undefined; // Retrieves a specific sync data by key
  removeSyncData: (key: string) => void; // Removes a specific sync data by key
}

export const useSyncStore = create<SyncStoreState>()(
  devtools(
    persist(
      immer((set, get) => ({
        data: {},

        setSyncData: (key, data) =>
          set((state) => {
            state.data[key] = data;
          }),

        getSyncData: (key) => get().data[key],

        getKeysByPrefix: (prefix) => Object.keys(get().data).filter((key) => key.startsWith(prefix)),

        removeSyncData: (key) => set((state) => delete state.data[key]),
      })),
      {
        version: 1,
        name: `${config.slug}-sync-data-store`,
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
