import mdx from '@mdx-js/rollup';
import reactScan from '@react-scan/vite-plugin-react-scan';
import terser from '@rollup/plugin-terser';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import path from 'node:path';
import rehypeShiki from '@shikijs/rehype';
import rehypeSlug from 'rehype-slug';
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
import { docsFrontmatter } from './vite/docs-frontmatter';
import { docsEditor } from './vite/docs-editor';
import { remarkLinkRepoPaths } from './vite/remark-link-repo-paths';

// Repo docs (cella/*.md) start with an h1 for GitHub readers, but the docs page view
// already renders the frontmatter title as h1. Drop the leading h1 when such a file
// is compiled as page content. Content-root files are authored without an h1.
const remarkStripRepoDocH1 = () => (tree: { children: { type: string; depth?: number }[] }, file: { path?: string }) => {
  if (!file.path || file.path.includes('/src/content/docs/')) return;
  const index = tree.children.findIndex((node) => node.type === 'heading');
  if (index !== -1 && tree.children[index].depth === 1) tree.children.splice(index, 1);
};

const isStorybook = process.env.STORYBOOK === 'true';
const isDev = appConfig.mode === 'development';
const frontendUrl = new URL(appConfig.frontendUrl);

// Tunnel mode: frontendUrl is the public ngrok origin (no port); Vite still listens locally.
const devPort = Number(frontendUrl.port) || 3000;
const isTunneled = frontendUrl.hostname !== 'localhost';

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
    port: devPort,
    strictPort: true,
    // Same-origin development: the dev server is the app origin and proxies the
    // service prefixes to their local ports. Services serve under their own prefix
    // (backend self-mounts /api, yjs strips /yjs), so no path rewrite here.
    proxy: {
      '/api': { target: 'http://localhost:4000' },
      '/yjs': { target: 'ws://localhost:4002', ws: true },
      '/mcp': { target: 'http://localhost:4003' },
    },
    // Tunnel mode: ngrok terminates TLS and forwards plain HTTP — accept the public
    // Host header and point HMR websockets back at the public origin.
    ...(isTunneled ? { allowedHosts: [frontendUrl.hostname], hmr: { protocol: 'wss', host: frontendUrl.hostname, clientPort: 443 } } : {}),
    watch: {
      ignored: ['**/backend/**', '**/sdk/**'],
    },
  },
  preview: {
    port: devPort,
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
    // Production source maps are public by choice (open-source frontend): Maple has no
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
    // Repo docs (cella/*.md and package READMEs like infra/README.md) are also compilable
    // so a thin content/docs .mdx wrapper can import them as the page body. Single
    // source of truth for docs that live in the repo.
    {
      enforce: 'pre' as const,
      ...mdx({
        include: /\/(src\/content\/docs\/.*\.(md|mdx)|cella\/[A-Z][A-Z_]*\.md|[a-z-]+\/README\.md)$/,
        format: 'detect',
        // Read component overrides (links, headings) from MDXProvider context. A
        // `components` prop does not cross into imported modules, and wrapper pages
        // render imported repo docs (cella/*.md) as their body.
        providerImportSource: '@mdx-js/react',
        remarkPlugins: [
          remarkFrontmatter,
          remarkMdxFrontmatter,
          remarkGfm,
          remarkStripRepoDocH1,
          // Autolink inline code that names a real repo file to its GitHub blob URL.
          [
            remarkLinkRepoPaths,
            { repoRoot: path.resolve(__dirname, '..'), repoUrl: appConfig.company.githubUrl },
          ],
        ],
        // Heading ids for anchor links + scroll spy. The `spy-` DOM id prefix follows the
        // spy store convention (hooks/use-scroll-spy-store.ts); the slug part is
        // github-slugger, so URL hashes match GitHub's anchors for the same markdown.
        // Must stay in sync with the heading extraction in vite/docs-frontmatter.ts.
        rehypePlugins: [
          [rehypeSlug, { prefix: 'spy-' }],
          // Syntax highlighting at build time (Node): no runtime highlighter shipped
          // and none of the CSP/WASM constraints that force the runtime CodeViewer onto
          // Shiki's JS engine. Same github theme pair; dual-theme output picks light/dark
          // via CSS vars keyed off the `.dark` class (styling/tailwind.css).
          [
            rehypeShiki,
            {
              themes: { light: 'github-light-default', dark: 'github-dark-default' },
              defaultColor: false,
              langs: ['typescript', 'bash', 'text'],
              defaultLanguage: 'text',
              fallbackLanguage: 'text',
            },
          ],
        ],
      }),
    },
    // Build-time frontmatter index of docs pages (virtual:docs-frontmatter), so the
    // docs sidebar/table metadata doesn't statically import the page bodies.
    docsFrontmatter(),
    // Dev-only write-back endpoint so the pages table can edit frontmatter and
    // reparent pages by rewriting/moving the md/mdx files (apply: 'serve').
    docsEditor(),
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
    // Terser removes console.debug. Skip in dev for faster builds.
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
    // react + @mdx-js/react deduped so repo docs outside the frontend package (cella/*.md,
    // package READMEs compiled by the mdx plugin) resolve their jsx runtime and MDX
    // provider imports to the frontend's copies.
    dedupe: ['yjs', 'react', 'react-dom', '@mdx-js/react'],
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

// Enable HTTPS only when serving https on localhost directly. Tunnel mode is https at
// the public origin, but ngrok terminates TLS and forwards plain HTTP to Vite.
if (frontendUrl.protocol === 'https:' && !isTunneled) {
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
