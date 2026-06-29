import { beforeAll, vi } from 'vitest';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as a11yAddonAnnotations from "@storybook/addon-a11y/preview";
import { setProjectAnnotations } from '@storybook/react-vite';
import * as projectAnnotations from './preview';

// Initialize i18next for Storybook tests
i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
  interpolation: { escapeValue: false },
});

// This is an important step to apply the right configuration when testing your stories.
// More info at: https://storybook.js.org/docs/api/portable-stories/portable-stories-vitest#setprojectannotations
const annotations = setProjectAnnotations([a11yAddonAnnotations, projectAnnotations]);

// Silence noisy console output during tests (QueryPersister debug logs,
// zustand warnings, info breadcrumbs). Errors remain visible.
console.info = vi.fn();
console.debug = vi.fn();
console.log = vi.fn();
console.warn = vi.fn();

// Run Storybook's beforeAll hook
beforeAll(annotations.beforeAll);