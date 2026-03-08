import { useEffect } from 'react';
import { appConfig, type Theme } from 'shared';
import { type Mode, uiStore } from '~/store/ui';

const root = window.document.documentElement;

function setModeClass(mode: Mode) {
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
}

function setBrandColor(passedTheme: Theme) {
  const color = passedTheme === 'none' ? null : appConfig.theme.colors[passedTheme];

  // Check if exist <style> tag for brand color override
  let brandStyleTag = document.getElementById('brand-style');
  if (!brandStyleTag) {
    brandStyleTag = document.createElement('style');
    brandStyleTag.id = 'brand-style';
    document.head.appendChild(brandStyleTag);
  }

  // Set --brand CSS var to the selected theme color (or clear it to use CSS default)
  brandStyleTag.innerHTML = color ? `:root { --brand: ${color}; }` : '';
}

/**
 * Service component to set theme and mode classes on root element
 */
export const Themer = () => {
  useEffect(() => {
    uiStore.subscribe(({ mode }) => {
      setModeClass(mode);
    });
    uiStore.subscribe(({ theme }) => {
      setBrandColor(theme);
    });
  }, []);

  // Set initial theme and mode
  setModeClass(uiStore.getState().mode);
  setBrandColor(uiStore.getState().theme);

  return null;
};
