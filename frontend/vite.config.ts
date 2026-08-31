import { execSync } from 'node:child_process';
import path from 'node:path';
import mdx from '@mdx-js/rollup';
import reactScan from '@react-scan/vite-plugin-react-scan';
import babel from '@rolldown/plugin-babel';
import terser from '@rollup/plugin-terser';
import rehypeShiki from '@shikijs/rehype';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import rehypeSlug from 'rehype-slug';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, type Plugin, type UserConfig } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import svgr from 'vite-plugin-svgr';
import rootPkg from '../package.json' with { type: 'json' };
import { appConfig } from '../shared/index.ts';
import { docsEditor } from './vite/docs-editor.ts';
import { docsFrontmatter } from './vite/docs-frontmatter.ts';
import { localesPlugin } from './vite/locales-plugin.ts';
import { remarkLinkRepoPaths } from './vite/remark-link-repo-paths.ts';
import { sdkWatch } from './vite/sdk-watch.ts';

// Repo docs (cella/*.md) start with an h1 for GitHub readers, but the docs page view
// already renders the frontmatter title as h1. Drop the leading h1 when such a file
// is compiled as page content. Content-root files are authored without an h1.
const remarkStripRepoDocH1 =
  () => (tree: { children: { type: string; depth?: number }[] }, file: { path?: string }) => {
    if (!file.path || file.path.includes('/src/content/docs/')) return;
    const index = tree.children.findIndex((node) => node.type === 'heading');
    if (index !== -1 && tree.children[index].depth === 1) tree.children.splice(index, 1);
  };

const isStorybook = process.env.STORYBOOK === 'true';
// `pnpm deps:bundle:analyze` sets this to emit a per-module treemap next to the build.
const isAnalyze = process.env.ANALYZE === 'true';
const isDev = appConfig.mode === 'development';

/**
 * Libraries only a dynamic import reaches, each with the chunk it is routed to. Chunk grouping reads
 * this twice: the per-package backstop excludes them so it cannot claim one, and the groups after it
 * claim them last. Adding a library here is all that is needed for both; naming it in only one place
 * is what puts it on the boot path. `pnpm deps:bundle:check` asserts the result.
 */
const FEATURE_LIBS: [name: string, packages: RegExp][] = [
  ['editor', /^(@blocknote|@tiptap|@handlewithcare|prosemirror-[\w-]+|yjs|y-protocols|y-prosemirror|lib0)/],
  ['pdf', /^(pdfjs-dist|react-pdf|jspdf[\w.-]*)$/],
  ['media', /^(media-chrome|player\.style)$/],
  ['gleap', /^gleap$/],
  ['react-scan', /^react-scan$/],
  ['maps', /^(@vis\.gl|@googlemaps)/],
  ['uppy', /^(@uppy|@transloadit)/],
];

/** The npm package a module id belongs to, or undefined outside node_modules. */
const packageOf = (id: string) => {
  if (!id.includes('node_modules')) return undefined;
  const tail = id.split(/node_modules[\\/]/).pop() ?? '';
  return tail.match(/^((?:@[^\\/]+[\\/])?[^\\/]+)/)?.[1]?.replace(/\\/g, '/');
};

/**
 * App modules only a dynamic import reaches. Excluded from the boot-path groups that would otherwise
 * match them by folder, and claimed by the on-demand group last, so each forms its own lazy chunk.
 */
const ON_DEMAND_APP =
  /[\\/]src[\\/]modules[\\/](common[\\/](blocknote|uploader)[\\/]|common[\\/]gleap-support|common[\\/]form-fields[\\/]blocknote|attachment[\\/](render[\\/]|offline[\\/]upload-service))/;

/** The Yjs field registry is a plain map of field names that boot-time cache code reads. */
const YJS_REGISTRY = /[\\/]blocknote[\\/]yjs-editor/;

const frontendUrl = new URL(appConfig.frontendUrl);

// Imported repository docs use relative links so they also work on GitHub and in editors. When a
// target has a docs wrapper, keep navigation inside the site; other repo paths still point to GitHub.
const repoDocRoutes = {
  'cella/ARCHITECTURE.md': '/docs/page/architecture',
  'cella/CLIENT.md': '/docs/page/architecture/client',
  'cella/MULTI_TENANCY.md': '/docs/page/architecture/multi_tenancy',
  'cella/SYNC_ENGINE.md': '/docs/page/architecture/sync-engine',
  'cella/PERMISSIONS.md': '/docs/page/architecture/permissions',
  'cella/SCHEMA_EVOLUTION.md': '/docs/page/architecture/schema-evolution',
  'cella/OTEL.md': '/docs/page/architecture/observability',
  'cella/ADD_ENTITY.md': '/docs/page/guides/new-entity',
  'cella/TESTING.md': '/docs/page/guides/testing',
  'cella/RELEASES.md': '/docs/page/guides/releases',
  'cella/CHANGELOG.md': '/docs/page/changelog',
  'cella/AGENTS.md': '/docs/page/llms',
  'cella/QUICKSTART.md': '/docs/page/quickstart',
  'cdc/README.md': '/docs/page/architecture/cdc',
  'yjs/README.md': '/docs/page/architecture/yjs',
  'cella/DEPLOYMENT.md': '/docs/page/guides/deployment',
  'bench/README.md': '/docs/page/guides/load-testing',
} as const;

// Tunnel mode: frontendUrl is the public ngrok origin (no port); Vite still listens locally.
const devPort = Number(frontendUrl.port) || appConfig.devPorts.frontend;
const isTunneled = frontendUrl.hostname !== 'localhost';

// Release identifier for error/replay tagging (Maple serviceVersion). Git SHA
// when available (local/CI builds), 'unknown' otherwise (e.g. sourceless container).
const gitSha = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
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
      '/api': { target: `http://localhost:${appConfig.devPorts.api}` },
      '/yjs': { target: `ws://localhost:${appConfig.devPorts.yjs}`, ws: true },
      '/mcp': { target: `http://localhost:${appConfig.devPorts.mcp}` },
    },
    // Tunnel mode: ngrok terminates TLS and forwards plain HTTP. Accept the public
    // Host header and point HMR websockets back at the public origin.
    ...(isTunneled
      ? { allowedHosts: [frontendUrl.hostname], hmr: { protocol: 'wss', host: frontendUrl.hostname, clientPort: 443 } }
      : {}),
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
        // Rolldown ignores `manualChunks` when `codeSplitting` is set, so all grouping lives here
        codeSplitting: {
          minSize: 50 * 1024, // Minimum chunk size of 50 Kb
          groups: [
            // Order is what decides chunking here. A group captures the dependencies of whatever it
            // matches and puts them in its own chunk, and a later group's `test` does not protect a
            // module from that, so the only defence is to claim a package before a heavier group can
            // reach it. Three bands follow, and breaking the order puts a feature library on the
            // boot path; `pnpm deps:bundle --assert-lazy` fails the build when that happens.
            //   1. Boot-time third-party code.
            //   2. A backstop claiming every remaining package, one chunk each.
            //   3. Feature libraries last, so they can only capture what nothing else claimed.
            // The app groups after them follow the same rule in the direction dependencies point:
            // foundational first, on-demand last, because the editor imports the UI primitives.

            // One chunk per grammar/theme module: each language stays its own lazily
            // loadable chunk, and the grammars- prefix keeps all of them out of the SW
            // precache (globIgnores). The name encodes the package variant so the
            // plain and precompiled builds of a language never merge into one chunk.
            // The shiki core engine is untouched and stays in precached chunks.
            {
              name: (id: string) => {
                // The oniguruma WASM engine is dynamically importable but unused: the app
                // CSP has no 'unsafe-eval', so the JavaScript regex engine is always used
                if (/node_modules[\\/]@shikijs[\\/]engine-oniguruma[\\/]/.test(id)) return 'grammars-wasm';
                const m = id.match(
                  /node_modules[\\/]@shikijs[\\/](langs|langs-precompiled|themes)[\\/]dist[\\/]([\w.+-]+?)\.m?js$/,
                );
                if (!m || m[2] === 'index') return null;
                const variant = m[1] === 'langs-precompiled' ? 'pc-' : m[1] === 'themes' ? 'theme-' : '';
                return `grammars-${variant}${m[2].replace(/[^\w-]/g, '-')}`;
              },
              // The top-level minSize is inherited as the group default and would silently
              // drop languages smaller than it back to automatic (precached) chunking
              minSize: 0,
            },
            // Merge all lucide icon modules into one shared chunk to keep request count low
            { name: 'icons', test: /node_modules[\\/]lucide-react[\\/]/ },
            // Broadly shared vendor packages, one chunk each. Groups get an explicit
            // minSize: 0 because the top-level minSize is inherited as the group default
            // and silently drops groups that accumulate less than it.
            { name: 'base-ui', test: /node_modules[\\/](@base-ui|@floating-ui)[\\/]/, minSize: 0 },
            { name: 'tanstack', test: /node_modules[\\/]@tanstack[\\/]/, minSize: 0 },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, minSize: 0 },
            { name: 'zod', test: /node_modules[\\/]zod[\\/]/, minSize: 0 },
            {
              name: 'motion',
              test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/,
              minSize: 0,
            },
            { name: 'forms', test: /node_modules[\\/](react-hook-form|@hookform)[\\/]/, minSize: 0 },
            // Tracing initialises during boot, so it is on the boot path by design.
            { name: 'otel', test: /node_modules[\\/]@opentelemetry[\\/]/, minSize: 0 },
            // Curated list of tiny ubiquitous libraries that belong in one shared chunk. Each is on
            // the boot path already; grouping them costs no laziness and saves a request apiece,
            // which the per-package backstop below would otherwise spend on a few hundred bytes.
            {
              name: 'vendor',
              test: /node_modules[\\/](zustand|clsx|cnfast|dayjs|nanoid|uuidv7|dobajs|sonner|input-otp|qrcode\.react|canvas-confetti|onedollarstats|react-use-downloader|dexie-react-hooks|class-variance-authority|embla-carousel[\w-]*|@atlaskit[\\/]pragmatic-drag-and-drop[\w-]*|@simplewebauthn[\\/]browser|@mdx-js[\\/]react|@t3-oss[\\/]env-core|use-sync-external-store|use-debounce|react-error-boundary|react-intersection-observer|slugify|react-i18next|i18next[\w-]*|@babel[\\/]runtime)[\\/]/,
              minSize: 0,
            },
            {
              // Backstop for every package the groups above do not name, one chunk each, so each
              // keeps the lifecycle of whatever imports it. It runs before the feature libraries so
              // that a shared package cannot be captured into one of them: react-dom landed inside
              // the editor chunk that way, and every module needing React then booted the editor.
              // The feature packages are excluded so the groups below still claim them.
              name: (id: string) => {
                const pkg = packageOf(id);
                return pkg ? `v-${pkg.replace(/[^\w-]/g, '-')}` : null;
              },
              test: (id: string) => {
                const pkg = packageOf(id);
                return Boolean(pkg) && !FEATURE_LIBS.some(([, packages]) => packages.test(pkg as string));
              },
              minSize: 0,
            },
            // Feature libraries, each reached only through a dynamic import. Last among the
            // third-party groups: everything they share with boot-time code is already claimed, so
            // capturing dependencies cannot drag anything else in with them.
            ...FEATURE_LIBS.map(([name, packages]) => ({
              name,
              test: (id: string) => {
                const pkg = packageOf(id);
                return Boolean(pkg) && packages.test(pkg as string);
              },
              minSize: 0,
            })),

            // ── App layer, foundational first ────────────────────────────────────────────────────
            // The shared workspace package holds appConfig and is imported from nearly every module.
            // blocknote-schema-configs.ts is the one exception: it imports @blocknote/core, so it is
            // left for the editor groups to capture.
            {
              name: 'shared-config',
              test: (id: string) => /[\\/]shared[\\/]/.test(id) && !/blocknote-schema-configs/.test(id),
              minSize: 0,
            },
            // The generated SDK client is read by the query registries during boot.
            { name: 'sdk-gen', test: /[\\/]sdk[\\/]gen[\\/]/, minSize: 0 },
            // App-wide primitives loaded on any real screen, plus the Yjs field registry that
            // query/realtime reads. `shared/` is excluded because the path shape matches it too.
            {
              name: 'app-core',
              test: (id: string) =>
                (/[\\/]src[\\/](hooks|utils|lib|query)[\\/]|[\\/]src[\\/]modules[\\/]ui[\\/]/.test(id) ||
                  YJS_REGISTRY.test(id)) &&
                !/[\\/]shared[\\/]/.test(id),
              minSize: 0,
            },
            {
              // Attachment modules that boot-time code reads: the query registry, the offline
              // download service, and the small helpers the layout and routes touch. upload-service
              // is excluded because it imports @uppy/core and only a dynamic import reaches it.
              name: 'attachment-core',
              test: (id: string) =>
                /[\\/]src[\\/]modules[\\/]attachment[\\/](query|file-placeholder|search-params-schemas)/.test(id) ||
                (/[\\/]src[\\/]modules[\\/]attachment[\\/]offline[\\/]/.test(id) && !ON_DEMAND_APP.test(id)) ||
                /[\\/]src[\\/]modules[\\/]attachment[\\/]helpers[\\/]persist-attachments/.test(id),
              minSize: 0,
            },
            {
              // Shared app components, minus the wrappers claimed by their own groups below: each
              // statically imports a feature library that would follow them into this boot chunk.
              name: 'common',
              test: (id: string) => /[\\/]src[\\/]modules[\\/]common[\\/]/.test(id) && !ON_DEMAND_APP.test(id),
              minSize: 0,
            },
            // Route shims are thin glue; route components stay in their module chunks
            { name: 'routes', test: /[\\/]src[\\/]routes[\\/]/, minSize: 0 },
            {
              // One chunk per remaining feature module folder, keeping feature-level laziness
              name: (id: string) => {
                // Left for the on-demand group below, so each forms its own lazy chunk; the
                // `m-common` and `m-attachment` chunks are on the boot path.
                if (ON_DEMAND_APP.test(id)) return null;
                const m = id.match(/[\\/]src[\\/]modules[\\/]([\w-]+)[\\/]/);
                return m ? `m-${m[1]}` : null;
              },
              minSize: 0,
            },
            {
              // ── On-demand app code, last ──────────────────────────────────────────────────────
              // The blocknote wrappers and the form field that renders them, the uploader, the chat
              // widget, and the attachment renderers behind `lazyNamed`. Claimed after every group
              // above, because they import the UI primitives, the query layer and the attachment
              // helpers, and a group captures what it matches along with its dependencies.
              name: (id: string) => {
                if (!ON_DEMAND_APP.test(id)) return null;
                if (/[\\/]attachment[\\/]render[\\/]/.test(id)) return 'attachment-render';
                // Kept apart from the uploader UI: the UI reaches the editor statically, so sharing
                // a chunk made starting this background service load the editor too.
                if (/[\\/]attachment[\\/]offline[\\/]upload-service/.test(id)) return 'upload-service';
                if (/[\\/]common[\\/]uploader[\\/]/.test(id)) return 'uploader';
                if (/[\\/]common[\\/]gleap-support/.test(id)) return 'gleap-support';
                return 'editor-app';
              },
              minSize: 0,
            },
          ],
        },
      },
    },
    // Production source maps are public by choice (open-source frontend): Maple has no
    // sourcemap upload/symbolication, so public maps are what make minified stacks in error
    // events and session replays readable. Switch to 'hidden' if the frontend ever closes source.
    sourcemap: !isDev,
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
    // Compile content and repository Markdown to React plus frontmatter before the React plugin.
    // Thin MDX pages can therefore import canonical repository docs.
    {
      enforce: 'pre' as const,
      ...mdx({
        // Repo docs live under cella/ only; an app's root-level SHOUTCASE .md (README, CHANGELOG) are not doc pages.
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
            {
              repoRoot: path.resolve(import.meta.dirname, '..'),
              repoUrl: appConfig.company.githubUrl,
              docRoutes: repoDocRoutes,
            },
          ],
        ],
        // Generate GitHub-compatible heading slugs with the scroll-spy's DOM prefix.
        // Keep aligned with frontmatter heading extraction.
        rehypePlugins: [
          [rehypeSlug, { prefix: 'spy-' }],
          // Highlight Markdown at build time with dual GitHub themes selected by CSS variables.
          // No runtime highlighter or CSP/WASM handling is required.
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
    // `*.svg?react` imports become React components (jsx only, no svgo pass). Must run before react().
    svgr({ include: '**/*.svg?react' }),
    react(),
    babel({ presets: [reactCompilerPreset()], include: ['./src/**/*.{ts,tsx,js,jsx}'] }),
    tailwindcss(),
    // Locales pipeline: merges common.json + app.json into the runtime `c` namespace,
    // serves the result at /locales/{lng}/{ns}.json in dev and emits it into the build.
    // The processed cache in .vscode/.locales-cache is also what i18n Ally reads.
    localesPlugin({
      srcDir: path.resolve(import.meta.dirname, '../locales'),
      outDir: path.resolve(import.meta.dirname, '../.vscode/.locales-cache'),
      merge: { target: 'c', sources: ['common', 'app'] },
      verbose: false,
    }),
    viteStaticCopy({
      targets: [
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
    ...(isAnalyze
      ? [
          visualizer({
            filename: 'stats/bundle.html',
            template: 'treemap',
            gzipSize: true,
            brotliSize: true,
          }) as Plugin,
        ]
      : []),
  ],
  resolve: {
    // react + @mdx-js/react deduped so repo docs outside the frontend package (cella/*.md,
    // package READMEs compiled by the mdx plugin) resolve their jsx runtime and MDX
    // provider imports to the frontend's copies.
    dedupe: ['yjs', 'react', 'react-dom', '@mdx-js/react'],
    alias: {
      '#json': path.resolve(import.meta.dirname, '../json'),
      '~': path.resolve(import.meta.dirname, './src'),
    },
  },
  define: {
    // The bundle re-evaluates shared/src/config-builder/app-config.ts in the
    // browser, so mode selection and the URL overrides it reads must survive
    // into this replacement object; NODE_ENV alone silently rebakes production.
    'process.env': Object.fromEntries(
      (['NODE_ENV', 'APP_MODE', 'FRONTEND_URL', 'BACKEND_URL', 'BACKEND_AUTH_URL', 'YJS_URL', 'MCP_API_URL'] as const)
        .filter((key) => process.env[key] !== undefined)
        .map((key) => [key, process.env[key]]),
    ),
    // Injected into lib/sw.ts for the push badge recount and API path exclusions
    __BACKEND_URL__: JSON.stringify(appConfig.backendUrl),
    // Release identifier for observability (lib/maple.ts serviceVersion)
    __APP_VERSION__: JSON.stringify(gitSha),
    // Root release version, shown on the docs landing page
    __PKG_VERSION__: JSON.stringify(rootPkg.version),
    // Devtools gate. A literal, so rolldown folds the branch away and the react-scan
    // chunk leaves the production graph; `appConfig.mode` is a property read it cannot fold.
    __DEV_TOOLS__: JSON.stringify(appConfig.mode !== 'production'),
  },
} satisfies UserConfig;

// Setup PWA with custom service worker (injectManifest) for push delivery and app-badge updates
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
          src: '/static/common/icons/favicon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/static/common/icons/favicon-512x512.png',
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
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      // `grammars-*` is the codeSplitting group for shiki/tm-grammars: runtime-loaded, not precached
      globIgnores: ['**/grammars-*.js', '**/static/common/flags/**/*'],
      maximumFileSizeToCacheInBytes: 100 * 1024 * 1024, // 100MB
    },
  }),
);

// Enable HTTPS only when serving https on localhost directly. Tunnel mode is https at
// the public origin, but ngrok terminates TLS and forwards plain HTTP to Vite.
if (frontendUrl.protocol === 'https:' && !isTunneled) {
  viteConfig.plugins?.push(basicSsl());
}

// Enable additional plugins only in development mode
if (appConfig.mode === 'development' && !isStorybook) {
  viteConfig.plugins?.push(
    sdkWatch(),
    reactScan({
      enable: false,
      scanOptions: {
        showToolbar: false,
      },
    }),
  );
}

// https://vitejs.dev/config/
export default defineConfig(viteConfig);
