import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/db/migrate.ts', 'seed/template/user.ts', 'seed/template/data.ts', 'seed/app-specific/data.ts'],
  splitting: false,
  sourcemap: true,
  clean: true,
  format: ['cjs'],
  minify: false,
});
