import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/yjs-worker.ts'],
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
      // Explicit shared subpath aliases so esbuild resolves them during bundling.
      // Without these, tsup/esbuild can't follow the package.json "exports" map
      // because noExternal inlines the package but doesn't resolve subpath exports.
      'shared/worker-lifecycle': '../shared/src/utils/worker-lifecycle.ts',
      'shared/wait-for-backend': '../shared/src/utils/wait-for-backend.ts',
      'shared/event-loop-monitor': '../shared/src/utils/event-loop-monitor.ts',
    };
    options.platform = 'node';
    options.mainFields = ['module', 'main'];
    options.conditions = ['module'];
  },
  external: [/^@opentelemetry/],
});
