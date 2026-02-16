import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  format: ['esm'],
  target: 'esnext',
  minify: false,
  esbuildOptions(options) {
    options.alias = {
      '#': '../backend/src',
    };
    options.platform = 'node';
    options.mainFields = ['module', 'main'];
    options.conditions = ['module'];
  },
});
