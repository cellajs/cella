import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '#': path.resolve(__dirname, './src'),
      '#json': path.resolve(__dirname, '../json'),
    },
  },
  test: {
    env: {
      PGLITE: 'true',
    },
  },
});
