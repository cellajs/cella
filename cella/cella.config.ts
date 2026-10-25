import { defineConfig } from '@cellajs/cli/config';

/**
 * Cella sync config: run with `pnpm cella` to interact with cella upstream or forks.
 */
export default defineConfig({
  settings: {
    upstreamUrl: 'git@github.com:cellajs/cella.git',
    upstreamBranch: 'main',
    // upstreamTrack: 'release',
    syncWithPackages: true,
    packageJsonSync: ['dependencies', 'devDependencies', 'scripts', 'overrides', 'exports', 'engines', 'packageManager'],
    fileLinkMode: 'file',
  },

  // Top-down interaction with forks.
  forks: [
    { name: 'raak', localPath: '../raak', remoteUrl: 'git@github.com:cellajs/raak.git', pullBranch: 'main' },
    { name: 'projectcampus', localPath: '../projectcampus', remoteUrl: 'git@github.com:cellajs/projectcampus.git', pullBranch: 'main' },
  ],

  // File overrides
  overrides: {
    // Paths the fork fully owns: never synced, whether existing or new
    // NOTE: package.jsons, lockfile, this file, modules with `app` owner are also ignored, with their static assets
    ignored: [
      'README.md',
      'infra/compose.gen.yml',
      'infra/Pulumi.production.yaml',
      'infra/Pulumi.staging.yaml',
      'infra/environments',
      'infra/runner.json',
      'sdk/gen',
      'shared/config',
      'backend/drizzle',
      'frontend/public/static/common',
      'frontend/src/content',
      'frontend/src/routes/routeTree.gen.ts',
      // Routes of the app-owned marketing module
      'frontend/src/routes/_public/_marketing',
      'frontend/src/routes/_public/_marketing.tsx',
      'frontend/src/modules/common/morph-animation',
      'frontend/public/favicon.ico',
      'frontend/public/favicon.svg',
      'frontend/public/thumbnail.png',
      'frontend/src/modules/common/logo.tsx',
      'frontend/src/styling/app.css',
      'frontend/src/modules/auth/legal/legal-config.ts',
      'locales/en/app.json',
      'locales/nl/app.json',
      'locales/en/appError.json',
      'locales/nl/appError.json',
      '.github/release-please-manifest.json',
      '.github/release-please-config.json',
      'json/accessibility-conformance.json',
      'locales/en/about.json',
      'locales/nl/about.json',
    ],
    // Paths pinned to the app: the app copy always wins, upstream hunks never merge in. Adopt them by hand
    // from the analyze list ("protected but behind upstream").
    pinned: [
      'backend/src/db/channel-tables.ts',
      'backend/src/db/product-tables.ts',
      'backend/src/modules.ts',
      'backend/src/bundle-config.ts',
      'backend/src/mocks/app-product-mocks.ts',
      'backend/src/modules/attachment/attachment-placement.ts',
      'backend/src/modules/notification/notification-seed-subjects.ts',
      'backend/src/modules/auth/sso/role-from-claims.ts',
      'backend/src/schemas/app-schemas.ts',
      'frontend/src/query/extra-local-user-stores.ts',
      'frontend/src/routes-config.tsx',
      'frontend/src/alert-config.tsx',
      'frontend/src/entity-sync-queries.ts',
      'frontend/src/styling/gradients.css',
      'a11y/scope-config.ts',
      'bench/src/seeds/attachment-home.ts',
      'cella/skills/screenshots/shots-config.mjs',
      'json/text-blocks.json',
    ],
  },
});
