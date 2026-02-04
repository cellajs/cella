import { defineConfig } from './cli/cella/config';

/**
 * Cella sync config: run with `pnpm sync`.
 */
export default defineConfig({
  settings: {
    upstreamUrl: 'git@github.com:cellajs/cella.git',
    upstreamBranch: 'development',
    upstreamRemoteName: 'cella-upstream',
    forkBranch: 'development',
    packageJsonSync: ['dependencies', 'devDependencies', 'scripts'],
    mergeStrategy: 'squash',
    fileLinkMode: 'file'
  },

  // File overrides
  overrides: {
    // Files and directories to be fully ignored during sync
    ignored: [
      "README.md",
      "info/QUICKSTART.md",
      "cli/create-cella/**",
      "frontend/public/static/docs.gen/**",
      "frontend/src/api.gen/**",
      "frontend/public/static/icons/**",
      "frontend/public/static/images/**",
      "frontend/public/static/logo/**",
      "frontend/public/static/screenshots/**",
      "frontend/src/modules/common/bg-animation/**",
      "backend/drizzle/**",
      "backend/scripts/seeds/data/**",
    ],
    // Files and directories pinned to fork; prefer fork version during merge conflicts
    pinned: [
      "lefthook.yaml",
      "package.json",
      "pnpm-lock.yaml",
      "render.yaml",
      "compose.yaml",
      "cella.config.ts",
      "shared/default-config.ts",
      "shared/development-config.ts",
      "shared/staging-config.ts",
      "shared/test-config.ts",
      "shared/production-config.ts",
      "shared/tunnel-config.ts",
      "frontend/package.json",
      "frontend/public/favicon.ico",
      "frontend/public/favicon.svg",
      "frontend/public/static/openapi.json",
      "frontend/src/nav-config.tsx",
      "frontend/src/routes-resolver.ts",
      "frontend/src/routes-config.tsx",
      "frontend/src/menu-config.tsx",
      "frontend/src/alert-config.tsx",
      "frontend/src/offline-config.tsx",
      "frontend/src/styling/gradients.css",
      "frontend/src/routes/route-tree.tsx",
      "frontend/src/routes/marketing-routes.tsx",
      "frontend/src/modules/common/app/app-sheets.tsx",
      "frontend/src/modules/common/logo.tsx",
      "frontend/src/modules/common/blocknote/blocknote-config.ts",
      "frontend/src/modules/home/index.tsx",
      "frontend/src/modules/home/onboarding/onboarding-config.ts",
      "frontend/src/modules/marketing/marketing-config.tsx",
      "frontend/src/modules/marketing/about/about-page.tsx",
      "frontend/src/modules/users/profile-page-content.tsx",
      "backend/package.json",
      "backend/src/custom-env.ts",
      "backend/src/table-config.ts",
      "backend/src/relatable-config.ts",
      "backend/src/routes.ts",
      "backend/src/permissions/permissions-config.ts",
      "backend/src/docs/tags-config.ts",
      "json/text-blocks.json",
      "locales/en/about.json",
      "locales/en/app.json"
    ]
  }
});