import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface GeneralState {
  offlineAccess: boolean;
  toggleOfflineAccess: () => void;
}

export const useGeneralStore = create<GeneralState>()(
  devtools(
    persist(
      immer((set) => ({
        offlineAccess: false,
        toggleOfflineAccess: () => {
          set((state) => {
            state.offlineAccess = !state.offlineAccess;
          });
        },
      })),
      {
        version: 3,
        name: `${config.slug}-general`,
        partialize: (state) => ({
          offlineAccess: state.offlineAccess,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
