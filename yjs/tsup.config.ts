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
    options.platform = 'node';
    options.mainFields = ['module', 'main'];
    options.conditions = ['module'];
  },
  external: [/^@opentelemetry/],
});
