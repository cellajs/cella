export type RepoConfig = {
  use: "local" | "remote";
  branch: string;
  filepath: string;  // required if use === 'local'
  owner: string;     // required if use === 'remote'
  repo: string;      // required if use === 'remote'
};

export const boilerplateConfig: RepoConfig = {
  use: 'local',
  branch: "development",
  filepath: "/home/gino/Github/cella",
  owner: "cellajs",
  repo: "cella",
};

export const forkConfig: RepoConfig = {
  use: 'local',
  branch: "development",
  filepath: "/home/gino/Github/raak",
  owner: "",
  repo: "",
};

export const ignoredFiles = [
  'README.md',
  'package.json',
  'pnpm-lock.yaml',
  'render.yaml',
  'compose.yaml',
  'cella.config.js',
  'info/*',
  'config/default.ts',
  'config/staging.ts',
  'config/development.ts',
  'config/production.ts',
  'config/tunnel.ts',
  'cli/create-cella/*',
  'frontend/public/favicon.ico',
  'frontend/public/favicon.svg',
  'frontend/public/static/icons/*',
  'frontend/public/static/images/*',
  'frontend/public/static/logo/*',
  'frontend/public/static/screenshots/*',
  'frontend/src/nav-config.tsx',
  'frontend/src/menu-config.tsx',
  'frontend/src/alert-config.tsx',
  'frontend/src/offline-config.tsx',
  'frontend/src/styling/gradients.css',
  'frontend/src/routes/route-tree.tsx',
  'frontend/src/routes/marketing.tsx',
  'frontend/src/api.gen/*',
  'frontend/src/modules/common/logo.tsx',
  'frontend/src/modules/common/bg-animation/*',
  'frontend/src/modules/common/blocknote/blocknote-config.ts',
  'frontend/src/modules/common/blocknote/app-specific-custom/*',
  'frontend/src/modules/home/onboarding/onboarding-config.ts',
  'frontend/src/modules/marketing/marketing-config.tsx',
  'frontend/src/modules/marketing/about/about-page.tsx',
  'frontend/src/modules/users/profile-page-content.tsx',
  'frontend/package.json',
  'backend/package.json',
  'backend/drizzle/*',
  'backend/scripts/seeds/data/*',
  'backend/src/custom-env.ts',
  'backend/src/entity-config.ts',
  'backend/src/attachment-config.ts',
  'backend/src/routes.ts',
  'backend/src/permissions/permissions-config.ts',
  'backend/src/lib/docs-config.ts',
  'backend/src/lib/notifications/novu-config.ts',
  'json/text-blocks.json',
  'locales/en/about.json',
  'locales/en/app.json',
]