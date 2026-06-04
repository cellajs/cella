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
      "bench",
      "sdk/gen",
      "shared/config",
      "frontend/public/static/docs.gen",
      "frontend/public/static/icons",
      "frontend/public/static/images",
      "frontend/public/static/logo",
      "frontend/public/static/screenshots",
      "frontend/src/modules/common/bg-animation",
      "backend/drizzle",
    ],
    // Exact files pinned to fork; prefer fork version during merge conflicts
    pinnedFiles: [
      "package.json",
      "pnpm-lock.yaml",
      "backend/compose.yaml",
      "cella.config.ts",
      "frontend/package.json",
      "frontend/public/favicon.ico",
      "frontend/public/favicon.svg",
      "frontend/public/static/openapi.json",
      "frontend/src/nav-config.tsx",
      "frontend/src/routes-config.tsx",
      "frontend/src/menu-config.tsx",
      "frontend/src/alerter/alert-config.tsx",
      "frontend/src/list-queries-config.tsx",
      "frontend/src/styling/gradients.css",
      "frontend/src/routes/route-tree.tsx",
      "frontend/src/routes/marketing-routes.ts",
      "frontend/src/routes/organization-components.tsx",
      // TODO move logo out of common, thats confusing
      "frontend/src/modules/common/logo.tsx",
      "frontend/src/modules/home/home-page.tsx",
      "frontend/src/modules/home/onboarding/onboarding-config.ts",
      "frontend/src/modules/home/onboarding/onboarding-seed.ts",
      "frontend/src/modules/marketing/marketing-config.tsx",
      "frontend/src/modules/marketing/about/about-page.tsx",
      "frontend/src/modules/user/user-profile-content.tsx",
      "backend/package.json",
      "backend/src/tables.ts",
      "backend/src/routes.ts",
      "backend/src/db/schema/memberships.ts",
      "backend/src/db/schema/inactive-memberships.ts",
      "backend/src/db/schema/attachments.ts",
      "backend/src/db/schema/activities.ts",
      "json/text-blocks.json",
      "locales/en/about.json",
      "locales/en/app.json"
    ]
  }
});