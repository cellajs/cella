import reactScan from '@react-scan/vite-plugin-react-scan';
import terser from '@rollup/plugin-terser';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import path from 'node:path';
// import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, Plugin, type UserConfig } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { appConfig } from '../shared';
// import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { i18nextHMRPlugin } from 'i18next-hmr/vite';
import { openApiWatch } from './vite/openapi-watch';
import { localesHMR } from './vite/locales-hmr';

const isStorybook = process.env.STORYBOOK === 'true';
const isDev = appConfig.mode === 'development';
const frontendUrl = new URL(appConfig.frontendUrl);

const viteConfig = {
  logLevel: process.env.DEBUG_MODE ? 'info' : 'warn',
  server: {
    host: '0.0.0.0',
    port: Number(frontendUrl.port),
    strictPort: true,
    watch: {
      ignored: [
        '**/backend/**',
        '**/vite/temp-*/**', // Ignore temp folders from generate-client
        '**/.generate-client.lock', // Ignore lock file
      ],
    },
  },
  preview: {
    port: Number(frontendUrl.port),
  },
  build: {
    rollupOptions: {
      output: {
        codeSplitting: {
          minSize: 50 * 1024, // Minimum chunk size of 50 Kb
        },
        manualChunks(id) {
          if (id.includes('shiki')) {
            return 'shiki'; // Ensures all shiki-related modules go into one chunk
          }
        },
      },
    },
    sourcemap: isDev ? false : true,
    manifest: true,
    minify: isDev ? false : 'esbuild',
  },
  optimizeDeps: {
    exclude: [],
  },
  clearScreen: false,
  plugins: [
    // TanStackRouterVite(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    appConfig.sentSentrySourceMaps
      ? (sentryVitePlugin({
        disable: appConfig.mode === 'development',
        org: appConfig.slug,
        project: appConfig.slug,
        authToken: process.env.SENTRY_AUTH_TOKEN,
      }) as unknown as Plugin)
      : undefined,
    viteStaticCopy({
      targets: [
        {
          src: '../locales/**/*',
          dest: 'locales',
        },
        {
          src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
          dest: '',
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
    // Terser removes console.debug — skip in dev for faster builds
    ...(isDev
      ? []
      : [
          terser({
            compress: {
              pure_funcs: ['console.debug'],
            },
          }) as Plugin,
        ]),
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
    },
    // Injected into sw.ts for periodic badge sync
    '__BACKEND_URL__': JSON.stringify(appConfig.backendUrl),
  },
} satisfies UserConfig;

// Setup PWA with custom service worker (injectManifest) for periodic badge sync
viteConfig.plugins?.push(
  VitePWA({
    disable: !appConfig.has.pwa,
    strategies: 'injectManifest',
    srcDir: 'src',
    filename: 'sw.ts',
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
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,svg,png,svg,ico,woff2}'],
      globIgnores: ['**/shiki.*', '**/shiki/**', '**/static/flags/**/*'],
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
    localesHMR({
      srcDir: path.resolve(__dirname, '../locales'),
      outDir: path.resolve(__dirname, '../.vscode/.locales-cache'),
      merge: { target: 'common', sources: ['app'] },
      verbose: false,
    }),
    i18nextHMRPlugin({ localesDir: '../locales' }),
    openApiWatch(),
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
