import { useEffect } from 'react';
import { useThemeStore } from '~/store/theme';

const root = window.document.documentElement;

const setModeClass = (mode: string) => {
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
};

const setThemeClass = (theme: string) => {
  for (const className of root.classList) {
    if (className.startsWith('theme-')) {
      root.classList.remove(className);
    }
  }

  root.classList.add(`theme-${theme}`);
};

export const Theming = () => {
  useEffect(() => {
    useThemeStore.subscribe(({ mode }) => {
      setModeClass(mode);
    });

    useThemeStore.subscribe(({ theme }) => {
      setThemeClass(theme);
    });
  }, []);

  // Set initial theme and mode
  setModeClass(useThemeStore.getState().mode);
  setThemeClass(useThemeStore.getState().theme);

  return null;
};
