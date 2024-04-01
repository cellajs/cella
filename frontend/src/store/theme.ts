import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export type Mode = 'light' | 'dark';
export type Theme = string;

interface ThemeState {
  mode: Mode;
  theme: Theme;
  setMode: (mode: Mode) => void;
  setTheme: (theme: Theme) => void;
}

const browserMode = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export const useThemeStore = create<ThemeState>()(
  devtools(
    immer(
      persist(
        (set) => ({
          mode: browserMode,
          theme: 'rose',
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
