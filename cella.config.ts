import { defineConfig } from './cli/cella/config';

/**
 * Cella sync config: run with `pnpm cella` to interact with cella upstream or forks.
 */
export default defineConfig({
  settings: {
    upstreamUrl: 'git@github.com:cellajs/cella.git',
    upstreamBranch: 'main',
    // Sync to the latest cella release by default (recommended): stable, reviewable,
    // and tied to a changelog. To pin a specific release, set `upstreamTag: 'v0.5.0'`
    // and bump it via PR. For active development on unreleased cella changes, set
    // `upstreamTrack: 'branch'` to follow the tip of `upstreamBranch` instead.
    // upstreamTrack: 'release',
    // upstreamTag: 'v0.5.0',
    syncWithPackages: true,
    packageJsonSync: ['dependencies', 'devDependencies', 'scripts', 'overrides'],
    mergeStrategy: 'squash',
    fileLinkMode: 'file',
  },

  // Top-down interaction with forks.
  // - pullBranch: branch cella pulls contributions from (contributions service)
  // - pushBranch: branch cella syncs changes into (forks service)
  forks: [
    { name: 'raak', localPath: '../raak', remoteUrl: 'git@github.com:cellajs/raak.git', pullBranch: 'main', pushBranch: 'main' },
  ],

  // File overrides
  overrides: {
    // Paths the fork fully owns — never synced (existing or new)
    ignored: [
      'README.md',
      'infra/compose.gen.yml',
      'infra/Pulumi.production.yaml',
      'infra/Pulumi.staging.yaml',
      'sdk/gen',
      'sdk/src/.generate-sdk.lock',
      'shared/config',
      'backend/drizzle',
      'frontend/public/static/icons',
      'frontend/public/static/images',
      'frontend/public/static/logo',
      'frontend/public/static/screenshots',
      'frontend/src/modules/common/bg-animation',
      'frontend/src/routes/routeTree.gen.ts',
      'sdk/src/plugins/openapi-parser/tests/__snapshots__/parse-spec.test.ts.snap',
      '.github/release-please-manifest.json',
      '.github/release-please-config.json',
    ],
    // Paths pinned to fork; prefer fork version during merge conflicts
    pinned: [
      'pnpm-lock.yaml',
      'cella.config.ts',
      'backend/src/tables.ts',
      'backend/src/routes.ts',
      'backend/src/modules/memberships/memberships-db.ts',
      'frontend/public/favicon.ico',
      'frontend/public/favicon.svg',
      'frontend/src/nav-config.tsx',
      'frontend/src/routes-config.tsx',
      'frontend/src/menu-config.tsx',
      'frontend/src/alert-config.tsx',
      'frontend/src/list-queries-config.tsx',
      'frontend/src/styling/gradients.css',
      'frontend/src/modules/home/home-page.tsx',
      'frontend/src/modules/home/onboarding/onboarding-config.ts',
      'frontend/src/modules/home/onboarding/onboarding-seed.ts',
      'frontend/src/modules/marketing/logo.tsx',
      'frontend/src/modules/marketing/marketing-config.tsx',
      'frontend/src/modules/marketing/about/about-page.tsx',
      'frontend/src/modules/user/user-profile-content.tsx',
      'json/text-blocks.json',
      'locales/en/about.json',
      'locales/en/app.json',
    ],
  },
});