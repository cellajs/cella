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
  /** Persists the query cache to IndexedDB, so it survives a restart; a build without `appConfig.has.pwa` turns it off. */
  offlineAccess: boolean;
  toggleOfflineAccess: () => void;

  /** Defaults to the browser's `prefers-color-scheme`. */
  mode: Mode;
  setMode: (mode: Mode) => void;

  /** `'none'` is the default theme. */
  theme: Theme;
  setTheme: (theme: Theme) => void;

  /** `'more'` forces the raised tokens and keeps toasts open. */
  contrast: Contrast;
  setContrast: (contrast: Contrast) => void;

  /** Public route alert IDs dismissed before a user DB exists. */
  publicAlertsSeen: string[];
  setPublicAlertSeen: (alertId: string) => void;

  /** One-time UI hint IDs already shown (e.g. floating nav menu label). */
  hintsSeen: string[];
  setHintSeen: (hintId: string) => void;

  /** Hides non-essential UI; not persisted. */
  focusView: boolean;
  setFocusView: (focusView: boolean) => void;

  /** Overlay kinds open now, such as `'sheeter'`; pull-to-refresh pauses while any is held. */
  uiLocks: string[];
  lockUI: (source: string) => void;
  unlockUI: (source: string) => void;

  /** Clears `offlineAccess` only; every other field keeps its value. */
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
