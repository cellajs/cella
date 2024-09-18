import { config } from 'config';
import { useEffect } from 'react';
import { hexToHsl } from '~/lib/hex-to-hsl';
import { type Theme, useThemeStore } from '~/store/theme';

const root = window.document.documentElement;

const setModeClass = (mode: string) => {
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
};

const setThemeColor = (passedTheme: Theme) => {
  if (passedTheme === 'none') return root.classList.remove('theme-base');
  root.classList.add('theme-base');

  const color = config.theme.colors[passedTheme];
  const hslColor = hexToHsl(color);

  // Check if exist <style> tag for theme-base rules
  let themeStyleTag = document.getElementById('theme-style');
  if (!themeStyleTag) {
    // Create a <style> tag
    themeStyleTag = document.createElement('style');
    themeStyleTag.id = 'theme-style';
    document.head.appendChild(themeStyleTag);
  }
  // update CSS rule for .theme-base
  themeStyleTag.innerHTML = `.theme-base { --primary: ${hslColor}; }`;
};

// This component is used to set the theme and mode classes on the root element
export const ThemeManager = () => {
  useEffect(() => {
    useThemeStore.subscribe(({ mode }) => {
      setModeClass(mode);
    });
    useThemeStore.subscribe(({ theme }) => {
      setThemeColor(theme);
    });
  }, []);

  // Set initial theme and mode
  setModeClass(useThemeStore.getState().mode);
  setThemeColor(useThemeStore.getState().theme);

  return null;
};
