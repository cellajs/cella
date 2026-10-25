import { useEffect } from 'react';
import { appConfig, type Theme } from 'shared';
import { type Contrast, type Mode, uiStore } from '~/modules/ui/ui-store';

const root = window.document.documentElement;

function setModeClass(mode: Mode) {
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
  setThemeColor();
}

/**
 * The browser chrome (Android's status bar, a PWA's title bar) takes the page background. The oklch token is painted
 * as one canvas pixel and read back as hex, which every browser parses: a canvas keeps oklch in its fillStyle.
 */
function setThemeColor() {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const canvas = meta && document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!meta || !canvas) return;
  canvas.fillStyle = getComputedStyle(document.body).backgroundColor;
  canvas.fillRect(0, 0, 1, 1);
  const [r, g, b] = canvas.getImageData(0, 0, 1, 1).data;
  meta.content = `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Raises the edge tokens for a user who asked for more contrast. `system` writes nothing: tailwind.css answers
 * `prefers-contrast: more` on its own, so the OS setting still applies if this never runs.
 */
function setContrastAttribute(contrast: Contrast) {
  if (contrast === 'more') root.dataset.contrast = 'more';
  else delete root.dataset.contrast;
}

function setBrandColor(theme: Theme) {
  const color = theme === 'none' ? null : appConfig.theme.colors[theme];

  let brandStyleTag = document.getElementById('brand-style');
  if (!brandStyleTag) {
    brandStyleTag = document.createElement('style');
    brandStyleTag.id = 'brand-style';
    document.head.appendChild(brandStyleTag);
  }

  // An empty tag falls back to the CSS default for --brand
  brandStyleTag.innerHTML = color ? `:root { --brand: ${color}; }` : '';
}

export function Themer() {
  // The listener fires on every uiStore write (overlay locks, focus view), so it acts only on the appearance changes.
  useEffect(
    () =>
      uiStore.subscribe((state, prev) => {
        if (state.mode !== prev.mode) setModeClass(state.mode);
        if (state.theme !== prev.theme) setBrandColor(state.theme);
        if (state.contrast !== prev.contrast) setContrastAttribute(state.contrast);
      }),
    [],
  );

  setModeClass(uiStore.getState().mode);
  setBrandColor(uiStore.getState().theme);
  setContrastAttribute(uiStore.getState().contrast);

  return null;
}
