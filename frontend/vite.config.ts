import path from 'node:path';
import terser from '@rollup/plugin-terser';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { type PluginOption, type UserConfig, defineConfig } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { config } from '../config';
// import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

// https://vitejs.dev/config/
export default defineConfig(() => {
  const frontendUrl = new URL(config.frontendUrl);

  const viteConfig = {
    server: {
      host: '0.0.0.0',
      port: Number(frontendUrl.port),
    },
    build: {
      rollupOptions: {},
      sourcemap: true,
    },
    optimizeDeps: {
      exclude: [],
    },
    plugins: [
      // TanStackRouterVite(),
      react(),
      config.sentSentrySourceMaps
        ? sentryVitePlugin({
            disable: config.mode === 'development',
            org: 'cella',
            project: 'cella',
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
            color: config.viteColor,
            url: config.frontendUrl,
            twitter: config.company.twitterHandle,
          },
        },
      }),
      terser({
        compress: {
          pure_funcs: ['console.debug'], // Removes console.debug
        },
      }),
      visualizer({ open: true, gzipSize: true }) as PluginOption,
    ],
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
        '#': path.resolve(__dirname, '../backend/src'),
      },
    },
    define: {
      'process.env': {
        NODE_ENV: JSON.stringify(process.env.NODE_ENV),
      },
    },
  } satisfies UserConfig;

  viteConfig.plugins?.push(
    VitePWA({
      disable: !config.has.pwa,
      devOptions: {
        enabled: false,
      },
      manifest: {
        name: config.name,
        short_name: config.name,
        description: config.description,
        theme_color: config.viteColor,
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
      // TODO: these glob patterns should not be necessary, it should pick all files from dist?
      // https://vite-pwa-org.netlify.app/guide/service-worker-precache.html
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,jpeg,svg,ico,json}'],
        globIgnores: ['**/public/static/flags/*.(svg|png)'],
        navigateFallbackDenylist: [/^.*\.(docx|DOCX|gif|GIF|doc|DOC|pdf|PDF|csv|CSV)$/, /^\/api\/v1*/, /^\/static\/*/],
      },
    }),
  );

  if (config.frontendUrl.includes('https')) viteConfig.plugins?.push([basicSsl()]);
  return viteConfig;
});
