import { appConfig, type Theme } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';

export type Mode = 'light' | 'dark';

interface UIStoreState {
  offlineAccess: boolean; // Offline access mode status
  toggleOfflineAccess: () => void; // Toggles the offline access state

  impersonating: boolean; // Impersonation mode status
  setImpersonating: (status: boolean) => void; // Sets the impersonation state

  mode: Mode; // Current color mode (default to system preference)
  setMode: (mode: Mode) => void; // Updates the color mode

  theme: Theme; // Selected theme ('none' for default)
  setTheme: (theme: Theme) => void; // Updates the theme

  focusView: boolean; // Focused view mode state
  setFocusView: (status: boolean) => void; // Toggles focus view state

  uiLocks: string[]; // Active UI lock sources
  lockUI: (source: string) => void; // Add a UI lock
  unlockUI: (source: string) => void; // Remove a UI lock

  clearUIStore: () => void; // Resets store to initial state
}

// Detects system preference
const browserMode = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

// Default state values
const initStore: Pick<UIStoreState, 'mode' | 'theme' | 'offlineAccess' | 'impersonating' | 'focusView' | 'uiLocks'> = {
  mode: browserMode,
  theme: 'none',
  offlineAccess: false,
  impersonating: false,
  focusView: false,
  uiLocks: [],
};

/**
 * UI store for non-user-identifiable states: offline access, impersonation, theme
 */
export const useUIStore = create<UIStoreState>()(
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
        setFocusView: (status) => {
          set((state) => {
            state.focusView = status;
            // Only move scroll to table if .focus-view-scroll is present
            if (status && document.getElementsByClassName('focus-view-scroll').length) {
              document.body.classList.add('focus-view-table');
            } else {
              document.body.classList.remove('focus-view-table');
            }
          });
        },
        lockUI: (source) => {
          set((state) => {
            if (!state.uiLocks.includes(source)) {
              state.uiLocks.push(source);
            }
          });
        },
        unlockUI: (source) => {
          set((state) => {
            const index = state.uiLocks.indexOf(source);
            if (index !== -1) {
              state.uiLocks.splice(index, 1);
            }
          });
        },
        clearUIStore: () =>
          set(() => ({
            offlineAccess: false,
            impersonating: false,
          })),
      })),
      {
        version: 2,
        name: `${appConfig.slug}-ui`,
        partialize: (state) => ({
          offlineAccess: state.offlineAccess,
          impersonating: state.impersonating,
          mode: state.mode,
          theme: state.theme,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
    { enabled: isDebugMode, name: 'ui store' },
  ),
);
