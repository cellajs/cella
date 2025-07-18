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
import { config } from '../config';
// import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { heyApiPlugin } from '@hey-api/vite-plugin';
import { openApiConfig } from './openapi-ts.config';
import { watchBackendOpenApi } from './src/openapi-watch-mode';

const ReactCompilerConfig = {
  /* ... */
};

const isStorybook = process.env.STORYBOOK === 'true';

const frontendUrl = new URL(config.frontendUrl);

const viteConfig = {
  logLevel: 'info',
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
    config.sentSentrySourceMaps
      ? sentryVitePlugin({
        disable: config.mode === 'development',
        org: config.slug,
        project: config.slug,
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
          title: config.name,
          description: config.description,
          keywords: config.keywords,
          author: config.company.name,
          color: config.themeColor,
          url: config.frontendUrl,
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

viteConfig.plugins?.push(
  VitePWA({
    disable: !config.has.pwa,
    devOptions: {
      enabled: false,
      navigateFallback: 'index.html',
      suppressWarnings: true,
    },
    manifest: {
      name: config.name,
      short_name: config.name,
      description: config.description,
      theme_color: '#333333',
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
          src: '/static/icons/maskable-icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,svg,ico}'],
      globIgnores: ['**/shiki.*', '**/shiki/**', '**/static/flags/**/*'],
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      maximumFileSizeToCacheInBytes: 100 * 1024 * 1024, // 100MB
    },
  }),
);
if (config.frontendUrl.includes('https')) viteConfig.plugins?.push([basicSsl()]);
if (config.mode === 'development' && !isStorybook)
  viteConfig.plugins?.push([
    watchBackendOpenApi(),
    heyApiPlugin({ config: openApiConfig }),
    reactScan({
      enable: false,
      scanOptions: {
        showToolbar: false,
      },
    }),
  ]);

// https://vitejs.dev/config/
export default defineConfig(viteConfig);
