import reactScan from '@react-scan/vite-plugin-react-scan';
import terser from '@rollup/plugin-terser';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import path from 'node:path';
// import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, type UserConfig } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { appConfig } from '../config';
// import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { i18nextHMRPlugin } from 'i18next-hmr/vite';
import { watchBackendOpenApi } from './vite/openapi-watch-mode';
import { swallowLocaleHMR } from './vite/swallow-locale-hmr';

const ReactCompilerConfig = {
  /* ... */
};

const isStorybook = process.env.STORYBOOK === 'true';
const frontendUrl = new URL(appConfig.frontendUrl);

const viteConfig = {
  logLevel: 'warn',
  server: {
    host: '0.0.0.0',
    port: Number(frontendUrl.port),
    strictPort: true,
    watch: {
      ignored: ['**/backend/**'], // Prevent restarts
    },
  },
  build: {
    rollupOptions: {
      output: {
        experimentalMinChunkSize: 50 * 1024, // Minimum chunk size of 50 Kb
        manualChunks(id) {
          if (id.includes('shiki')) {
            return 'shiki'; // Ensures all shiki-related modules go into one chunk
          }
        },
      },
    },
    sourcemap: true,
    manifest: true,
  },
  optimizeDeps: {
    exclude: [],
  },
  clearScreen: false,
  plugins: [
    // TanStackRouterVite(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', ReactCompilerConfig]],
      },
    }),
    tailwindcss(),
    appConfig.sentSentrySourceMaps
      ? sentryVitePlugin({
        disable: appConfig.mode === 'development',
        org: appConfig.slug,
        project: appConfig.slug,
        authToken: process.env.SENTRY_AUTH_TOKEN,
      })
      : undefined,
    viteStaticCopy({
      targets: [
        {
          src: '../locales/**/*',
          dest: 'locales',
        },
      ],
    }),
    createHtmlPlugin({
      template: './index.html',
      inject: {
        data: {
          title: appConfig.name,
          description: appConfig.description,
          keywords: appConfig.keywords,
          author: appConfig.company.name,
          color: appConfig.themeColor,
          url: appConfig.frontendUrl,
          apiUrl: appConfig.backendUrl,
        },
      },
    }),
    terser({
      compress: {
        pure_funcs: ['console.debug'], // Removes console.debug
      },
    }),
    // visualizer({ open: true, gzipSize: true }),
  ],
  resolve: {
    alias: {
      '#json': path.resolve(__dirname, '../json'),
      '~': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env': {
      NODE_ENV: JSON.stringify(process.env.NODE_ENV),
      VITE_QUICK: JSON.stringify(process.env.VITE_QUICK),
    },
  },
} satisfies UserConfig;

// Setup PWA
viteConfig.plugins?.push(
  VitePWA({
    disable: !appConfig.has.pwa,
    devOptions: {
      enabled: false,
      navigateFallback: 'index.html',
      suppressWarnings: true,
    },
    manifest: {
      name: appConfig.name,
      short_name: appConfig.name,
      description: appConfig.description,
      theme_color: '#222222',
      icons: [
        {
          src: '/static/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/static/icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/static/icons/icon-512x512.svg',
          sizes: '512x512',
          type: 'image/svg+xml',
          purpose: 'any',
        },
        {
          src: '/static/icons/maskable-icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,svg,ico,woff2}'],
      globIgnores: ['**/shiki.*', '**/shiki/**', '**/static/flags/**/*'],
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      maximumFileSizeToCacheInBytes: 100 * 1024 * 1024, // 100MB
    },
  })
);

// Enable HTTPS in development if the frontend URL uses it
if (appConfig.frontendUrl.includes('https')) {
  viteConfig.plugins?.push(basicSsl());
}

// Enable additional plugins only in development mode
if (appConfig.mode === 'development' && !isStorybook) {
  viteConfig.plugins?.push(
    i18nextHMRPlugin({ localesDir: '../locales' }),
    swallowLocaleHMR(),
    watchBackendOpenApi(),
    reactScan({
      enable: false,
      scanOptions: {
        showToolbar: false,
      },
    })
  );
}

// https://vitejs.dev/config/
export default defineConfig(viteConfig);
