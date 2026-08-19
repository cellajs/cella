import { defineConfig } from 'tsup';

/**
 * Packages that have to stay on disk. Everything else is inlined into dist/.
 * - pg-format, papaparse: CJS dynamic requires of data files that do not survive ESM bundling.
 * - @ngrok/ngrok, @napi-rs/canvas: native addons, loaded by platform-specific .node file.
 * - @opentelemetry/*: the SDK patches modules through the loader registry, so it loads from disk,
 *   and so does anything it instruments. `pg` is here for that reason: PgInstrumentation only ever
 *   sees a module the registry handed it, so an inlined copy emits no query spans.
 * - @blocknote/server-util and jsdom: jsdom resolves its default stylesheet through __dirname, so
 *   inlining it points that lookup at the bundle. server-util reaches jsdom, so both load from disk.
 * - pino and its transports: `pino.transport()` starts a worker thread from a file path inside the
 *   pino package, and resolves transport targets like 'pino-pretty' by name from the caller, so
 *   neither survives being inlined.
 */
const KEEP_ON_DISK = String.raw`pg(?:\/|$)|pg-format|papaparse|@ngrok\/ngrok|@napi-rs\/canvas|@opentelemetry\/|pino(?:-|\/|$)|thread-stream|sonic-boom|@blocknote\\/server-util|jsdom`;

export default defineConfig({
  entry: {
    main: 'src/main.ts',
    'seeds-bundle': 'scripts/seeds-bundle.ts',
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  format: ['esm'],
  target: 'esnext',
  minify: false,
  // Bundle everything except KEEP_ON_DISK, so the service loads one file plus a short list of
  // packages at runtime. tsup's `noExternal` takes precedence over `external`, so the exceptions
  // belong in this negative lookahead; `external` below repeats them to cover subpath imports.
  noExternal: [new RegExp(`^(?!(?:${KEEP_ON_DISK}))`)],
  // Bundled CJS dependencies call require() at runtime (chalk reaching for node:os, for one), and
  // esbuild's ESM output defines none. This supplies a working one.
  banner: {
    js: "import { createRequire as __nodeCreateRequire } from 'node:module';\nconst require = __nodeCreateRequire(import.meta.url);",
  },
  esbuildOptions(options) {
    options.alias = {
      '#': './src',
    };
    options.platform = 'node'; // Ensure the platform is set to Node.js
    options.mainFields = ['module', 'main']; // Prioritize ESM entry points
    options.conditions = ['module']; // Enforce use of ESM
    options.jsx = 'automatic'; // Use modern JSX transform for email templates
  },
  external: [
    // CJS dynamic data-file require does not survive ESM bundling.
    // Regexes: a bare name matches the exact specifier, and these are reached through subpaths too.
    /^pg-format(\/|$)/,
    /^papaparse(\/|$)/,
    // Native addons.
    /^@ngrok\/ngrok(\/|$)/,
    /^@napi-rs\/canvas(\/|$)/,
    // The SDK patches modules through the loader registry, so both it and anything it instruments
    // have to be loaded from disk; a bundled copy of `pg` is never handed to the instrumentation.
    /^@opentelemetry/,
    /^pg(\/|$)/,
    /^pino(-|\/|$)/,
    /^thread-stream(\/|$)/,
    /^sonic-boom(\/|$)/,
    /^@blocknote\/server-util(\/|$)/,
    /^jsdom(\/|$)/,
  ],
});
