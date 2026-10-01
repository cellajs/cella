import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';
import { appConfig } from 'shared';
import type { Plugin } from 'vite';
import { docsFrontmatter } from '../vite/docs-frontmatter.ts';

// The PWA plugin is app-only; stories get a service-worker hook that never reports an update.
const pwaRegisterStub: Plugin = {
  name: 'storybook-pwa-register-stub',
  resolveId: (id) => (id === 'virtual:pwa-register/react' ? '\0pwa-register-stub' : undefined),
  load: (id) =>
    id === '\0pwa-register-stub'
      ? 'export const useRegisterSW = () => ({ needRefresh: [false, () => {}], offlineReady: [false, () => {}], updateServiceWorker: async () => {} });'
      : undefined,
};

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "core": {
    "disableTelemetry": true,
  },
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest"
  ],
  "framework": {
    "name": "@storybook/react-vite",
    "options": {}
  },
  viteFinal: async (config) => {
    config.resolve = config.resolve || {};
    config.resolve.tsconfigPaths = true;
    // Mirror frontend/vite.config.ts process.env define for browser context
    config.define = {
      ...config.define,
      'process.env': {
        NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'development'),
      },
      __DEV_TOOLS__: 'true',
      __APP_VERSION__: JSON.stringify('storybook'),
    };
    // Every virtual module the app imports must resolve: an unresolved import fails Vite's dependency scan, so
    // dependencies are found mid-run and each discovery reloads the tests.
    config.plugins = [...(config.plugins ?? []), tailwindcss(), docsFrontmatter(), pwaRegisterStub];
    // The email stories render backend HTML: proxy the dev preview route so their fetch stays same-origin.
    config.server = {
      ...config.server,
      proxy: { ...config.server?.proxy, '/api/dev/emails': { target: `http://localhost:${appConfig.devPorts.api}` } },
    };
    return config;
  },
};
export default config;
