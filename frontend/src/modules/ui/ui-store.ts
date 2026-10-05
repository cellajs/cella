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

  contrast: Contrast; // Non-text contrast: 'system' follows prefers-contrast, 'more' forces the raised tokens
  setContrast: (contrast: Contrast) => void;

  keepMessages: boolean; // Toasts stay until dismissed, for a reader who needs more than a few seconds
  setKeepMessages: (status: boolean) => void;

  publicAlertsSeen: string[]; // Public route alert IDs dismissed before a user DB exists
  setPublicAlertSeen: (alertSeen: string) => void;

  hintsSeen: string[]; // One-time UI hint IDs already shown (e.g. floating nav menu label)
  setHintSeen: (hint: string) => void;

  focusView: boolean;
  setFocusView: (status: boolean) => void;

  uiLocks: string[]; // Active UI lock sources
  lockUI: (source: string) => void;
  unlockUI: (source: string) => void;

  reset: () => void;
}

// Guarded so tests in a node environment can import modules that reach this store
const browserMode = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const initStore: Pick<
  UIStoreState,
  'mode' | 'theme' | 'contrast' | 'offlineAccess' | 'keepMessages' | 'publicAlertsSeen' | 'hintsSeen' | 'focusView' | 'uiLocks'
> = {
  mode: browserMode,
  theme: 'none',
  contrast: 'system',
  offlineAccess: false,
  keepMessages: false,
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
        setKeepMessages: (status) => {
          set((state) => {
            state.keepMessages = status;
          });
        },
        setPublicAlertSeen: (alertSeen) => {
          set((state) => {
            if (!state.publicAlertsSeen.includes(alertSeen)) state.publicAlertsSeen.push(alertSeen);
          });
        },
        setHintSeen: (hint) => {
          set((state) => {
            if (!state.hintsSeen.includes(hint)) state.hintsSeen.push(hint);
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
          keepMessages: state.keepMessages,
          publicAlertsSeen: state.publicAlertsSeen,
          hintsSeen: state.hintsSeen,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
    { enabled: isDebugMode, name: 'ui store' },
  ),
);

// Non-hook alias for accessing store outside of React components / as a value (e.g. getState)
export { useUIStore as uiStore };
