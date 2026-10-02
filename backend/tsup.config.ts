import { defineConfig } from 'tsup';
import { keepOnDisk } from '../shared/src/keep-on-disk.ts';
import { appKeepOnDisk } from './src/bundle-config.ts';
import pkg from './package.json' with { type: 'json' };

// @ngrok/ngrok: native addon, loaded by platform-specific .node file.
const { noExternal, external } = keepOnDisk(['@ngrok/ngrok', ...appKeepOnDisk], pkg.dependencies);

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
  noExternal,
  // Bundled CJS dependencies call require() at runtime (chalk reaching for node:os, for one), and
  // esbuild's ESM output defines none. This supplies a working one.
  banner: {
    js: "import { createRequire as __nodeCreateRequire } from 'node:module';\nconst require = __nodeCreateRequire(import.meta.url);",
  },
  esbuildOptions(options) {
    options.alias = {
      '#': './src',
    };
    options.platform = 'node'; // Ensure the platform is set to Node.js
    options.mainFields = ['module', 'main']; // Prioritize ESM entry points
    options.conditions = ['module']; // Enforce use of ESM
    options.jsx = 'automatic'; // Use modern JSX transform for email templates
  },
  external,
});
