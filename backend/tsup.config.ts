import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/db/migrate.ts', 'seed/users.ts', 'seed/organizations.ts'],
  splitting: false,
  sourcemap: true,
  clean: true,
  format: ['cjs'],
  minify: false,
});
