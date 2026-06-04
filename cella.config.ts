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
    upstreamPinnedSha: '7ec622f8ea864b392daf9b176966f78ab29d7f82',
    upstreamRemoteName: 'cella-upstream',
    forkBranch: 'development',
    syncWithPackages: true,
    packageJsonSync: ['dependencies', 'devDependencies', 'scripts', 'overrides'],
    mergeStrategy: 'squash',
    fileLinkMode: 'file',
    // upstreamLocalPath: '../cella',
    // upstreamRepo: 'cellajs/cella',
  },

  // Local forks to sync to (for upstream template development)
  // Uncomment and configure when running from upstream cella repo
  forks: [
    { name: 'raak', path: '../raak' },
  ],

  // File overrides
  overrides: {
    // TODO consier only suppor directories for clarity: ignoredFolders and pinnedFiles?
    // Files and directories to be fully ignored during sync
    ignored: [
      "README.md",
      "bench/**",
      "infra/Pulumi.*.yaml",
      "frontend/public/static/docs.gen/**",
      "frontend/public/static/icons/**",
      "frontend/public/static/images/**",
      "frontend/public/static/logo/**",
      "frontend/public/static/screenshots/**",
      "frontend/src/modules/common/bg-animation/**",
      "backend/drizzle/**",
    ],
    // Files and directories pinned to fork; prefer fork version during merge conflicts
    pinned: [
      "package.json",
      "pnpm-lock.yaml",
      "backend/compose.yaml",
      "cella.config.ts",
      "shared/default-config.ts",
      "shared/development-config.ts",
      "shared/staging-config.ts",
      "shared/test-config.ts",
      "shared/production-config.ts",
      "shared/tunnel-config.ts",
      "shared/hierarchy-config.ts",
      "shared/permissions-config.ts",
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