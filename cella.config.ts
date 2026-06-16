import { defineConfig } from './cli/cella/config';

/**
 * Cella sync config: run with `pnpm cella` to interact with cella upstream or forks.
 */
export default defineConfig({
  settings: {
    upstreamUrl: 'git@github.com:cellajs/cella.git',
    upstreamBranch: 'development',
    // Pin to a reviewed upstream commit. Bump via PR after reviewing the diff
    // (https://github.com/cellajs/cella/compare/<old>...<new>). CI enforces this
    // is set to defend against a compromised upstream branch.
    // upstreamPinnedSha: '7ec622f8ea864b392daf9b176966f78ab29d7f82',
    workingBranch: 'development',
    syncWithPackages: true,
    packageJsonSync: ['dependencies', 'devDependencies', 'scripts', 'overrides'],
    mergeStrategy: 'squash',
    fileLinkMode: 'file',
    // upstreamLocalPath: '../cella',
  },

  // Top-down interaction with forks.
  // - pullBranch: branch cella pulls contributions from (contributions service)
  // - pushBranch: branch cella syncs changes into (forks service)
  forks: [
    { name: 'raak', localPath: '../raak', pullBranch: 'development', pushBranch: 'development' },
  ],

  // File overrides
  overrides: {
    // Folders (or exact paths) the fork fully owns — never synced (existing or new)
    ignoredFolders: [
      "README.md",
      "infra/compose.gen.yml",
      "infra/Pulumi.production.yaml",
      "infra/Pulumi.staging.yaml",
      "sdk/gen",
      "sdk/src/.generate-sdk.lock",
      "shared/config",
      "backend/drizzle",
      "frontend/public/static/icons",
      "frontend/public/static/images",
      "frontend/public/static/logo",
      "frontend/public/static/screenshots",
      "frontend/src/modules/common/bg-animation",
      "frontend/src/routes/routeTree.gen.ts",
    ],
    // Exact files pinned to fork; prefer fork version during merge conflicts
    pinnedFiles: [
      "package.json",
      "pnpm-lock.yaml",
      "cella.config.ts",
      "backend/compose.yaml",
      "backend/package.json",
      "backend/src/tables.ts",
      "backend/src/routes.ts",
      "backend/src/modules/memberships/memberships-db.ts",
      "frontend/package.json",
      "frontend/public/favicon.ico",
      "frontend/public/favicon.svg",
      "frontend/src/nav-config.tsx",
      "frontend/src/routes-config.tsx",
      "frontend/src/menu-config.tsx",
      "frontend/src/alert-config.tsx",
      "frontend/src/list-queries-config.tsx",
      "frontend/src/styling/gradients.css",
      "frontend/src/modules/home/home-page.tsx",
      "frontend/src/modules/home/onboarding/onboarding-config.ts",
      "frontend/src/modules/home/onboarding/onboarding-seed.ts",
      "frontend/src/modules/marketing/logo.tsx",
      "frontend/src/modules/marketing/marketing-config.tsx",
      "frontend/src/modules/marketing/about/about-page.tsx",
      "frontend/src/modules/user/user-profile-content.tsx",
      "json/text-blocks.json",
      "locales/en/about.json",
      "locales/en/app.json"
    ]
  }
});