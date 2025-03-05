import { type Theme, config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export type Mode = 'light' | 'dark';

interface GeneralStoreState {
  offlineAccess: boolean; // Offline access mode status
  toggleOfflineAccess: () => void; // Toggles the offline access state

  impersonating: boolean; // Impersonation mode status
  setImpersonating: (status: boolean) => void; // Sets the impersonation state

  mode: Mode; // Current color mode (default to system preference)
  setMode: (mode: Mode) => void; // Updates the color mode

  theme: Theme; // Selected theme ('none' for default)
  setTheme: (theme: Theme) => void; // Updates the theme

  clearGeneralStore: () => void; // Resets store to initial state
}

// Detects system preference
const browserMode = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

// Default state values
const initStore: Pick<GeneralStoreState, 'mode' | 'theme' | 'offlineAccess' | 'impersonating'> = {
  mode: browserMode,
  theme: 'none',
  offlineAccess: false,
  impersonating: false,
};

/**
 * General store for privacy-safe general states: offline access, impersonation, theme
 */
export const useGeneralStore = create<GeneralStoreState>()(
  devtools(
    persist(
      immer((set) => ({
        ...initStore,
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
        setMode: (mode) => {
          set((state) => {
            state.mode = mode;
          });
        },
        setTheme: (theme) => {
          set((state) => {
            state.theme = theme;
          });
        },
        clearGeneralStore: () =>
          set(() => ({
            offlineAccess: false,
            impersonating: false,
          })),
      })),
      {
        version: 1,
        name: `${config.slug}-general`,
        partialize: (state) => ({
          offlineAccess: state.offlineAccess,
          impersonating: state.impersonating,
          mode: state.mode,
          theme: state.theme,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
