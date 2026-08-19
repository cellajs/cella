import { defineConfig } from 'tsup';

/**
 * Packages that have to stay on disk. Everything else is inlined into dist/.
 * - pg, pg-format, pg-logical-replication: pg-format does a CJS dynamic require of a data file, and
 *   `pg` stays external so PgInstrumentation can still patch it through the loader registry.
 * - @opentelemetry/*: the SDK patches modules through that registry, so it loads from disk.
 * - @blocknote/server-util and jsdom: jsdom resolves its default stylesheet through __dirname, so
 *   inlining it points that lookup at the bundle. server-util reaches jsdom, so both load from disk.
 * - pino and its transports: `pino.transport()` starts a worker thread from a file path inside the
 *   pino package, and resolves targets like 'pino-pretty' by name from the caller.
 */
const KEEP_ON_DISK = String.raw`pg(?:\/|$)|pg-format|pg-logical-replication|@opentelemetry\/|pino(?:-|\/|$)|thread-stream|sonic-boom|@blocknote\\/server-util|jsdom`;


export default defineConfig({
  entry: ['src/yjs-worker.ts'],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  format: ['esm'],
  target: 'esnext',
  minify: false,
  // Bundle everything except KEEP_ON_DISK, so the service loads one file plus a short list of
  // packages at runtime. tsup's `noExternal` takes precedence over `external`, so the exceptions
  // belong here; `external` repeats them to cover subpath imports.
  noExternal: [new RegExp(`^(?!(?:${KEEP_ON_DISK}))`)],
  // Bundled CJS dependencies call require() at runtime (chalk reaching for node:os, for one), and
  // esbuild's ESM output defines none. This supplies a working one.
  banner: {
    js: "import { createRequire as __nodeCreateRequire } from 'node:module';\nconst require = __nodeCreateRequire(import.meta.url);",
  },
  esbuildOptions(options) {
    options.alias = {
      '#': '../backend/src',
      // Explicit shared subpath aliases so esbuild resolves them during bundling.
      // Without these, tsup/esbuild can't follow the package.json "exports" map
      // because noExternal inlines the package but doesn't resolve subpath exports.
      'shared/utils/nanoid': '../shared/src/utils/nanoid.ts',
      'shared/transloadit-config': '../shared/config/transloadit-config.ts',
      'shared/tracing': '../shared/src/tracing/tracing.ts',
      'shared/config-builder': '../shared/src/config-builder/index.ts',
      'shared/blocknote': '../shared/src/utils/text-from-block.ts',
      'shared/health-app': '../shared/src/health-app.ts',
      'shared/utils/is-cdn-url': '../shared/src/utils/is-cdn-url.ts',
      'shared/utils/ascii': '../shared/src/utils/ascii.ts',
    };
    options.platform = 'node';
    options.mainFields = ['module', 'main'];
    options.conditions = ['module'];
  },
  external: [
    /^pg(\/|$)/,
    /^pg-format(\/|$)/,
    /^pg-logical-replication(\/|$)/,
    /^@opentelemetry/,
    /^pino(-|\/|$)/,
    /^thread-stream(\/|$)/,
    /^sonic-boom(\/|$)/,
    /^@blocknote\/server-util(\/|$)/,
    /^jsdom(\/|$)/,
  ],
});
