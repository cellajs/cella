import { type Theme, config } from 'config';
import { useEffect } from 'react';
import { type Mode, useUIStore } from '~/store/ui';
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

/**
 * Service component to set theme and mode classes on root element
 */
export const Themer = () => {
  useEffect(() => {
    useUIStore.subscribe(({ mode }) => {
      setModeClass(mode);
    });
    useUIStore.subscribe(({ theme }) => {
      setThemeColor(theme);
    });
  }, []);

  // Set initial theme and mode
  setModeClass(useUIStore.getState().mode);
  setThemeColor(useUIStore.getState().theme);

  return null;
};
