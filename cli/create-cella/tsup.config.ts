import { resolve } from 'node:path';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/create-cella-cli.ts' },
  outDir: 'dist',
  clean: true,
  minify: false,
  format: ['esm'],
  target: 'esnext',
  splitting: false,
  sourcemap: true,
  dts: false,
  esbuildOptions(options) {
    options.alias = {
      '#': resolve(__dirname, './src'),
    };
    options.platform = 'node';
    options.mainFields = ['module', 'main'];
    options.conditions = ['module'];
  },
  external: [],
});
