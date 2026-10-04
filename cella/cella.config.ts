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
    packageJsonSync: ['dependencies', 'devDependencies', 'scripts', 'overrides', 'exports'],
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
    // NOTE: package.jsons, lockfiles, this file are always ignored
    // NOTE: Modules with `app` owner are also ignored, including their public static asset folder
    ignored: [
      'README.md',
      'infra/compose.gen.yml',
      'infra/Pulumi.production.yaml',
      'infra/Pulumi.staging.yaml',
      'sdk/gen',
      'shared/config',
      'backend/drizzle',
      'frontend/public/static/common',
      'frontend/src/content',
      'frontend/src/routes/routeTree.gen.ts',
      'frontend/src/modules/common/morph-animation',
      // App identity: brand assets and the app's own locale namespace. cella has no upstream fix
      // to push into these, so they are never synced. Template-consumed copy lives in common.json,
      // never in app.json.
      'frontend/public/favicon.ico',
      'frontend/public/favicon.svg',
      'frontend/public/thumbnail.png',
      'frontend/src/modules/common/logo.tsx',
      'frontend/src/modules/auth/legal/legal-config.ts',
      'locales/en/app.json',
      'locales/nl/app.json',
      '.github/release-please-manifest.json',
      // Accessibility results are about one product: each app's audit (`pnpm a11y`) writes its own ledger.
      'json/accessibility-conformance.json',
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
      'backend/src/modules/auth/sso/role-from-claims.ts',
      'backend/src/schemas/app-schemas.ts',
      'frontend/src/query/extra-local-user-stores.ts',
      'frontend/src/routes-config.tsx',
      'frontend/src/alert-config.tsx',
      'frontend/src/entity-sync-queries.ts',
      'frontend/src/styling/gradients.css',
      // Marketing copy: feature lists, pricing, showcases and the screenshots behind them
      'frontend/src/modules/marketing/marketing-config.tsx',
      // The pages and states the accessibility audit covers
      'a11y/scope-config.ts',
      'frontend/src/modules/home/home-page.tsx',
      'json/text-blocks.json',
      'locales/en/about.json',
    ],
  },
});
