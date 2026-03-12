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
      'shared/nanoid': '../shared/src/utils/nanoid.ts',
      'shared/upload-templates': '../shared/upload-templates.ts',
      'shared/tracing': '../shared/src/tracing/tracing.ts',
      'shared/builder': '../shared/src/builder/index.ts',
      'shared/blocknote': '../shared/src/utils/text-from-block.ts',
      'shared/is-cdn-url': '../shared/src/utils/is-cdn-url.ts',
      'shared/ascii': '../shared/src/utils/ascii.ts',
    };
    options.platform = 'node';
    options.mainFields = ['module', 'main'];
    options.conditions = ['module'];
  },
});
