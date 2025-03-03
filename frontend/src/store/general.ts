import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface GeneralState {
  offlineAccess: boolean; // Offline access mode status
  toggleOfflineAccess: () => void; // Toggles the offline access state

  impersonating: boolean; // Impersonation mode status
  setImpersonating: (status: boolean) => void; // Sets the impersonation state

  clearGeneralStore: () => void; // Resets store to initial state
}

export const useGeneralStore = create<GeneralState>()(
  devtools(
    persist(
      immer((set) => ({
        offlineAccess: false,
        impersonating: false,
        toggleOfflineAccess: () => {
          set((state) => {
            state.offlineAccess = !state.offlineAccess;
          });
        },
        setImpersonating: (status) => {
          set((state) => {
            state.impersonating = status;
          });
        },
        clearGeneralStore: () =>
          set(() => ({
            offlineAccess: false,
            impersonating: false,
          })),
      })),
      {
        version: 3,
        name: `${config.slug}-general`,
        partialize: (state) => ({
          offlineAccess: state.offlineAccess,
          impersonating: state.impersonating,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
