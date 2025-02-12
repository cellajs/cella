import { type Theme, config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export type Mode = 'light' | 'dark';

interface ThemeStoreState {
  mode: Mode; // Current color mode (default to system preference)
  theme: Theme; // Selected theme ('none' for default)

  setMode: (mode: Mode) => void; // Updates the color mode
  setTheme: (theme: Theme) => void; // Updates the theme
}

// Detects system preference
const browserMode = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

// Default state values
const initStore: Pick<ThemeStoreState, 'mode' | 'theme'> = {
  mode: browserMode,
  theme: 'none',
};

export const useThemeStore = create<ThemeStoreState>()(
  devtools(
    immer(
      persist(
        (set) => ({
          ...initStore,
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
        }),
        {
          version: 1,
          name: `${config.slug}-theme`,
          partialize: (state) => ({
            mode: state.mode,
            theme: state.theme,
          }),
          storage: createJSONStorage(() => localStorage),
        },
      ),
    ),
  ),
);
