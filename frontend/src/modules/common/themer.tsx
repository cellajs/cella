import { useEffect } from 'react';
import { appConfig, type Theme } from 'shared';
import { type Mode, uiStore } from '~/modules/ui/ui-store';

const root = window.document.documentElement;

function setModeClass(mode: Mode) {
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
}

function setBrandColor(passedTheme: Theme) {
  const color = passedTheme === 'none' ? null : appConfig.theme.colors[passedTheme];

  let brandStyleTag = document.getElementById('brand-style');
  if (!brandStyleTag) {
    brandStyleTag = document.createElement('style');
    brandStyleTag.id = 'brand-style';
    document.head.appendChild(brandStyleTag);
  }

  // An empty tag falls back to the CSS default for --brand
  brandStyleTag.innerHTML = color ? `:root { --brand: ${color}; }` : '';
}

export const Themer = () => {
  useEffect(() => {
    uiStore.subscribe(({ mode }) => {
      setModeClass(mode);
    });
    uiStore.subscribe(({ theme }) => {
      setBrandColor(theme);
    });
  }, []);

  setModeClass(uiStore.getState().mode);
  setBrandColor(uiStore.getState().theme);

  return null;
};
