import { useEffect } from 'react';
import { appConfig, type Theme } from 'shared';
import { type Mode, useUIStore } from '~/store/ui';

const root = window.document.documentElement;

function setModeClass(mode: Mode) {
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
}

function setThemeColor(passedTheme: Theme) {
  if (passedTheme === 'none') return root.classList.remove('theme-base');
  root.classList.add('theme-base');

  const color = appConfig.theme.colors[passedTheme];

  // Check if exist <style> tag for theme-base rules
  let themeStyleTag = document.getElementById('theme-style');
  if (!themeStyleTag) {
    // Create a <style> tag
    themeStyleTag = document.createElement('style');
    themeStyleTag.id = 'theme-style';
    document.head.appendChild(themeStyleTag);
  }
  // update CSS rule for .theme-base with hex color (compatible with oklch-based vars)
  themeStyleTag.innerHTML = `.theme-base { --primary: ${color}; }`;
}

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
