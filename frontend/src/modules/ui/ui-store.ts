import type { User } from 'sdk';
import { appConfig, type Theme } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';

export type Mode = 'light' | 'dark';

/** Mirrors the user's `contrast` column, so the two never drift. `system` leaves it to `prefers-contrast`. */
export type Contrast = User['contrast'];

interface UIStoreState {
  offlineAccess: boolean;
  toggleOfflineAccess: () => void;

  mode: Mode; // Current color mode (default to system preference)
  setMode: (mode: Mode) => void;

  theme: Theme; // Selected theme ('none' for default)
  setTheme: (theme: Theme) => void;

  contrast: Contrast; // 'system' follows prefers-contrast, 'more' forces the raised tokens and keeps toasts open
  setContrast: (contrast: Contrast) => void;

  publicAlertsSeen: string[]; // Public route alert IDs dismissed before a user DB exists
  setPublicAlertSeen: (alertId: string) => void;

  hintsSeen: string[]; // One-time UI hint IDs already shown (e.g. floating nav menu label)
  setHintSeen: (hintId: string) => void;

  focusView: boolean;
  setFocusView: (focusView: boolean) => void;

  uiLocks: string[]; // Active UI lock sources
  lockUI: (source: string) => void;
  unlockUI: (source: string) => void;

  reset: () => void;
}

// Guarded so tests in a node environment can import modules that reach this store
const browserMode = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const initStore: Pick<UIStoreState, 'mode' | 'theme' | 'contrast' | 'offlineAccess' | 'publicAlertsSeen' | 'hintsSeen' | 'focusView' | 'uiLocks'> = {
  mode: browserMode,
  theme: 'none',
  contrast: 'system',
  offlineAccess: false,
  publicAlertsSeen: [],
  hintsSeen: [],
  focusView: false,
  uiLocks: [],
};

/** UI store for non-user-identifiable state: offline access, theme. */
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
        setContrast: (contrast) => {
          set((state) => {
            state.contrast = contrast;
          });
        },
        setPublicAlertSeen: (alertId) => {
          set((state) => {
            if (!state.publicAlertsSeen.includes(alertId)) state.publicAlertsSeen.push(alertId);
          });
        },
        setHintSeen: (hintId) => {
          set((state) => {
            if (!state.hintsSeen.includes(hintId)) state.hintsSeen.push(hintId);
          });
        },
        setFocusView: (focusView) => {
          set((state) => {
            state.focusView = focusView;
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
        // Partial reset (not `set(initStore)`): only the session flag is cleared; mode/theme/contrast/uiLocks persist.
        reset: () => set(() => ({ offlineAccess: false })),
      })),
      {
        version: 1,
        name: `${appConfig.slug}-ui`,
        partialize: (state) => ({
          offlineAccess: state.offlineAccess,
          mode: state.mode,
          theme: state.theme,
          contrast: state.contrast,
          publicAlertsSeen: state.publicAlertsSeen,
          hintsSeen: state.hintsSeen,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
    { enabled: isDebugMode, name: 'ui store' },
  ),
);

export { useUIStore as uiStore };
