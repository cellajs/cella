import { defineConfig } from './cli/sync/src/config/types';

/**
 * Cella sync config: run with `pnpm sync`.
 */
export default defineConfig({
  // Upstream settings
  upstreamUrl: 'git@github.com:cellajs/cella.git',
  upstreamBranch: 'cli-sync',
  upstreamRemoteName: 'cella-upstream',  
  
  // Fork settings
  forkBranch: 'cli-sync',
  forkSyncBranch: 'sync-branch',        

  // Options
  maxSquashPreviews: 10,
  packageJsonSync: ['dependencies', 'devDependencies', 'scripts'],
  verbose: false,

  // File overrides
  overrides: {
    // Files and directories to be fully ignored during sync
    ignored: [
      "info/*",
    ],
    // Files pinned to fork; prefer fork version during merge conflicts
    pinned: [
      "README.md",
      "package.json",
      "pnpm-lock.yaml",
      "render.yaml",
      "compose.yaml",
      "cella.config.ts",
      "config/default.ts",
      "config/staging.ts",
      "config/development.ts",
      "config/production.ts",
      "config/tunnel.ts",
      "frontend/package.json",
      "frontend/public/favicon.ico",
      "frontend/public/favicon.svg",
      "frontend/public/static/openapi.json",
      "frontend/public/static/docs.gen/*",
      "frontend/public/static/icons/*",
      "frontend/public/static/images/*",
      "frontend/public/static/logo/*",
      "frontend/public/static/screenshots/*",
      "frontend/src/nav-config.tsx",
      "frontend/src/routes-resolver.ts",
      "frontend/src/routes-config.tsx",
      "frontend/src/menu-config.tsx",
      "frontend/src/alert-config.tsx",
      "frontend/src/offline-config.tsx",
      "frontend/src/api.gen/*",
      "frontend/src/styling/gradients.css",
      "frontend/src/routes/route-tree.tsx",
      "frontend/src/routes/marketing-routes.tsx",
      "frontend/src/modules/common/app/app-sheets.tsx",
      "frontend/src/modules/common/logo.tsx",
      "frontend/src/modules/common/bg-animation/*",
      "frontend/src/modules/common/blocknote/blocknote-config.ts",
      "frontend/src/modules/home/index.tsx",
      "frontend/src/modules/home/onboarding/onboarding-config.ts",
      "frontend/src/modules/marketing/marketing-config.tsx",
      "frontend/src/modules/marketing/about/about-page.tsx",
      "frontend/src/modules/users/profile-page-content.tsx",
      "backend/package.json",
      "backend/drizzle/*",
      "backend/scripts/seeds/data/*",
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