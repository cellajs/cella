import mdx from '@mdx-js/rollup';
import reactScan from '@react-scan/vite-plugin-react-scan';
import terser from '@rollup/plugin-terser';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import path from 'node:path';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
// import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, Plugin, type UserConfig } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { appConfig } from '../shared';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

import { execSync } from 'node:child_process';
import { sdkWatch } from './vite/sdk-watch';
import { localesHMR } from './vite/locales-hmr';

const isStorybook = process.env.STORYBOOK === 'true';
const isDev = appConfig.mode === 'development';
const frontendUrl = new URL(appConfig.frontendUrl);

// Release identifier for error/replay tagging (Maple serviceVersion). Git SHA
// when available (local/CI builds), 'unknown' otherwise (e.g. sourceless container).
const gitSha = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
})();

const viteConfig = {
  logLevel: isDev || process.env.DEBUG_MODE ? 'info' : 'warn',
  server: {
    host: '0.0.0.0',
    port: Number(frontendUrl.port),
    strictPort: true,
    watch: {
      ignored: ['**/backend/**', '**/sdk/**'],
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
    // NOTE: Production source maps are public by choice (open-source frontend): Maple has no
    // sourcemap upload/symbolication, so public maps are what make minified stacks in error
    // events and session replays readable. Switch to 'hidden' if the frontend ever closes source.
    sourcemap: isDev ? false : true,
    manifest: true,
    minify: isDev ? false : 'esbuild',
  },
  // Exclude workspace SDK from pre-bundling so regenerated types are picked up without restart
  optimizeDeps: {
    exclude: ['sdk'],
  },
  clearScreen: false,
  plugins: [
    // Generates src/routes/routeTree.gen.ts from file-based routes. Must run before react().
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: 'src/routes',
      generatedRouteTree: 'src/routes/routeTree.gen.ts',
      // Non-route helper files living in src/routes (router instance, shared utils, types, generated tree)
      routeFileIgnorePattern: '(router\\.ts|route-utils\\.tsx|types\\.ts|routeTree\\.gen\\.ts)$',
    }),
    // Docs content: compiles src/content/docs md/mdx files to React components with a
    // `frontmatter` named export (consumed by ~/modules/page/content.ts). Must run
    // before react() so the compiled JSX output is plain JS by the time react() sees it.
    {
      enforce: 'pre' as const,
      ...mdx({
        include: /\/src\/content\/docs\/.*\.(md|mdx)$/,
        format: 'detect',
        remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter, remarkGfm],
      }),
    },
    react(),
    babel({ presets: [reactCompilerPreset()], include: ['./src/**/*.{ts,tsx,js,jsx}'] }),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        { src: '../locales/**/*', dest: 'locales' },
        // Generated API docs assets: single source of truth in sdk/gen, served (not bundled) at /static.
        // stripBase: 2 drops the `sdk/gen` prefix so files land at /static/... (and /static/docs.gen/...).
        { src: '../sdk/gen/openapi.json', dest: 'static', rename: { stripBase: 2 } },
        { src: '../sdk/gen/zod.gen.ts', dest: 'static', rename: { stripBase: 2 } },
        { src: '../sdk/gen/types.gen.ts', dest: 'static', rename: { stripBase: 2 } },
        { src: '../sdk/gen/docs.gen/**/*', dest: 'static', rename: { stripBase: 2 } },
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
    dedupe: ['yjs'],
    alias: {
      '#json': path.resolve(__dirname, '../json'),
      '~': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env': {
      NODE_ENV: JSON.stringify(process.env.NODE_ENV),
    },
    // Injected into lib/sw.ts for periodic badge sync
    '__BACKEND_URL__': JSON.stringify(appConfig.backendUrl),
    // Release identifier for observability (lib/maple.ts serviceVersion)
    '__APP_VERSION__': JSON.stringify(gitSha),
  },
} satisfies UserConfig;

// Setup PWA with custom service worker (injectManifest) for periodic badge sync
viteConfig.plugins?.push(
  VitePWA({
    disable: !appConfig.has.pwa,
    strategies: 'injectManifest',
    srcDir: 'src/lib',
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
          src: '/static/common/icons/faviicon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/static/common/icons/faviicon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/static/common/icons/icon-512x512.svg',
          sizes: '512x512',
          type: 'image/svg+xml',
          purpose: 'any',
        },
        {
          src: '/static/common/icons/maskable-icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,svg,png,svg,ico,woff2}'],
      globIgnores: ['**/shiki.*', '**/shiki/**', '**/static/common/flags/**/*'],
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
    sdkWatch(),
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
