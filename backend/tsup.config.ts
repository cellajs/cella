import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    main: 'src/main.ts',
    'seeds-bundle': 'scripts/seeds-bundle.ts',
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  format: ['esm'],
  target: 'esnext',
  minify: false,
  // Bundle workspace packages so the Docker image works without pnpm workspace symlinks.
  noExternal: ['shared', 'cdc-worker', 'yjs-worker'],
  esbuildOptions(options) {
    options.alias = {
      '#': './src',
    };
    options.platform = 'node'; // Ensure the platform is set to Node.js
    options.mainFields = ['module', 'main']; // Prioritize ESM entry points
    options.conditions = ['module']; // Enforce use of ESM
    options.jsx = 'automatic'; // Use modern JSX transform for email templates
  },
  // pg-format is CJS doing `require(__dirname + '/reserved.js')` — neither the
  // __dirname reference nor the dynamic data-file require survives bundling
  // into an ESM output, and it detonated the in-process cdc worker at import
  // (singleVM). Loaded from node_modules instead (a cdc-worker prod dep, so it
  // ships in the image).
  external: ['papaparse', '@ngrok/ngrok', 'pg-format', /^@opentelemetry/],
});
