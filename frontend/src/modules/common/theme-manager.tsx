import { config } from 'config';
import { useEffect } from 'react';
import { type Mode, type Theme, useThemeStore } from '~/store/theme';
import { hexToHsl } from '~/utils/hex-to-hsl';

const root = window.document.documentElement;

const setModeClass = (mode: Mode) => {
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
};

const setThemeColor = (passedTheme: Theme) => {
  if (passedTheme === 'none') return root.classList.remove('theme-base');
  root.classList.add('theme-base');

  const color = config.theme.colors[passedTheme];
  // replace comas so tailwind can operate with color var
  const hslColor = hexToHsl(color).replaceAll(',', '');

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
