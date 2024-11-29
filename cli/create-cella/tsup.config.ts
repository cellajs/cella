import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
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
      '#': './src',
    };
    options.platform = 'node'; // Ensure the platform is set to Node.js
    options.mainFields = ['module', 'main']; // Prioritize ESM entry points
    options.conditions = ['module']; // Enforce use of ESM
  },
  external: [],
});
