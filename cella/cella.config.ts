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
    packageJsonSync: ['dependencies', 'devDependencies', 'scripts', 'overrides'],
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
      'frontend/src/modules/common/bg-animation',
      // App identity: brand assets and the app's own locale namespace. cella has no upstream fix
      // to push into these, so they are never synced (a pin would still merge and drop upstream
      // hunks on conflict). Template-consumed copy lives in common.json, never in app.json.
      'frontend/public/favicon.ico',
      'frontend/public/favicon.svg',
      'frontend/public/thumbnail.png',
      'frontend/src/modules/common/logo.tsx',
      'frontend/src/modules/auth/legal/legal-config.ts',
      'locales/en/app.json',
      'locales/nl/app.json',
      '.github/release-please-manifest.json',
    ],
    // Paths pinned to fork; prefer fork version during merge conflicts
    pinned: [
      'backend/src/tables.ts',
      'backend/src/db/channel-tables.ts',
      'backend/src/routes.ts',
      'backend/src/mocks/app-product-mocks.ts',
      'backend/src/modules/attachment/helpers/attachment-placement.ts',
      'backend/src/modules/memberships/memberships-db.ts',
      'backend/src/modules/organization/setup-config-schema.ts',
      'shared/app-exports.ts',
      'frontend/src/query/extra-local-user-stores.ts',
      'frontend/src/nav-config.tsx',
      'frontend/src/placement-config.ts',
      'frontend/src/routes-config.tsx',
      'frontend/src/menu-config.tsx',
      'frontend/src/alert-config.tsx',
      'frontend/src/list-queries-config.tsx',
      'frontend/src/styling/gradients.css',
      'frontend/src/modules/home/home-page.tsx',
      'frontend/src/modules/home/onboarding/onboarding-config.ts',
      'frontend/src/modules/user/user-profile-content.tsx',
      'json/text-blocks.json',
      'locales/en/about.json',
    ],
  },
});
