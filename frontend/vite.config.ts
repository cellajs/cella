import path from 'path';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { UserConfig, defineConfig, splitVendorChunkPlugin } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import config from '../config/index.ts';

// https://vitejs.dev/config/
export default defineConfig(() => {
  const frontendUrl = new URL(config.frontendUrl);

  const viteConfig = {
    server: {
      host: frontendUrl.hostname,
      port: Number(frontendUrl.port),
      https: frontendUrl.protocol === 'https:',
    },
    plugins: [
      react(),
      splitVendorChunkPlugin(),
      viteStaticCopy({
        targets: [
          {
            src: '../emails/static/**/*',
            dest: 'static',
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
            color: config.theme.rose.primary,
            url: config.frontendUrl,
            twitter: config.company.twitterHandle,
          },
        },
      }),
      VitePWA({
        manifest: {
          name: config.name,
          short_name: config.name,
          description: config.description,
          theme_color: config.theme.rose.primary,
          icons: [
            {
              src: '/icons/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/icons/icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          navigateFallbackDenylist: [/^.*\.(docx|DOCX|gif|GIF|doc|DOC|pdf|PDF|csv|CSV)$/, /^\/api\/v1*/],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => {
                return url.hostname === 'cdn.simplelocalize.io';
              },
              handler: 'CacheFirst',
              options: {
                cacheName: 'localization-cache',
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            // {
            //   urlPattern: ({ url }) => {
            //     return url.hostname === 'localhost' || url.pathname.startsWith('/api/v1');
            //   },
            //   handler: 'CacheFirst',
            //   options: {
            //     cacheName: 'api-cache',
            //     cacheableResponse: {
            //       statuses: [0, 200],
            //     },
            //   },
            // },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
        backend: path.resolve(__dirname, '../backend/src'),
        i18n: path.resolve(__dirname, '../i18n'),
        config: path.resolve(__dirname, '../config/index.ts'),
        emails: path.resolve(__dirname, '../emails'),
      },
    },
    define: {
      'process.env': {
        NODE_ENV: JSON.stringify(process.env.NODE_ENV),
      },
    },
  } as unknown as UserConfig;

  if (config.frontendUrl.includes('https')) viteConfig.plugins?.push([basicSsl()]);
  return viteConfig;
});
