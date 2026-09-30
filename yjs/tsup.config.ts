import { defineConfig } from 'tsup';
import { appKeepOnDisk } from '../backend/src/bundle-config.ts';
import { keepOnDisk } from '../shared/src/keep-on-disk.ts';

const { noExternal, external } = keepOnDisk(['pg-logical-replication', ...appKeepOnDisk]);

export default defineConfig({
  entry: ['src/yjs-worker.ts'],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  format: ['esm'],
  target: 'esnext',
  minify: false,
  noExternal,
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
  external,
});
