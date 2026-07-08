import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cdc-worker.ts'],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  format: ['esm'],
  target: 'esnext',
  minify: false,
  noExternal: ['shared'],
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
      'shared/utils/is-cdn-url': '../shared/src/utils/is-cdn-url.ts',
      'shared/utils/ascii': '../shared/src/utils/ascii.ts',
    };
    options.platform = 'node';
    options.mainFields = ['module', 'main'];
    options.conditions = ['module'];
  },
  external: [/^@opentelemetry/],
});
