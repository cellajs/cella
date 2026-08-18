import { appConfig, type Theme } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';

export type Mode = 'light' | 'dark';

interface UIStoreState {
  offlineAccess: boolean;
  toggleOfflineAccess: () => void;

  impersonating: boolean;
  setImpersonating: (status: boolean) => void;

  mode: Mode; // Current color mode (default to system preference)
  setMode: (mode: Mode) => void;

  theme: Theme; // Selected theme ('none' for default)
  setTheme: (theme: Theme) => void;

  publicAlertsSeen: string[]; // Public route alert IDs dismissed before a user DB exists
  setPublicAlertSeen: (alertSeen: string) => void;

  focusView: boolean;
  setFocusView: (status: boolean) => void;

  uiLocks: string[]; // Active UI lock sources
  lockUI: (source: string) => void;
  unlockUI: (source: string) => void;

  reset: () => void;
}

const browserMode = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const initStore: Pick<
  UIStoreState,
  'mode' | 'theme' | 'offlineAccess' | 'impersonating' | 'publicAlertsSeen' | 'focusView' | 'uiLocks'
> = {
  mode: browserMode,
  theme: 'none',
  offlineAccess: false,
  impersonating: false,
  publicAlertsSeen: [],
  focusView: false,
  uiLocks: [],
};

/** UI store for non-user-identifiable state: offline access, impersonation, theme. */
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
        setPublicAlertSeen: (alertSeen) => {
          set((state) => {
            if (!state.publicAlertsSeen.includes(alertSeen)) state.publicAlertsSeen.push(alertSeen);
          });
        },
        setFocusView: (status) => {
          set((state) => {
            state.focusView = status;
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
        // Partial reset (not `set(initStore)`): only session flags are cleared; mode/theme/uiLocks persist.
        reset: () =>
          set(() => ({
            offlineAccess: false,
            impersonating: false,
          })),
      })),
      {
        version: 1,
        name: `${appConfig.slug}-ui`,
        partialize: (state) => ({
          offlineAccess: state.offlineAccess,
          impersonating: state.impersonating,
          mode: state.mode,
          theme: state.theme,
          publicAlertsSeen: state.publicAlertsSeen,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
    { enabled: isDebugMode, name: 'ui store' },
  ),
);

// Non-hook alias for accessing store outside of React components / as a value (e.g. getState)
export { useUIStore as uiStore };
