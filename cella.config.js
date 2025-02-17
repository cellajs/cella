/**
 * Cella configuration object.
 *
 * @typedef {Object} CellaConfig
 * @property {string} divergedFile - Path to the file where diverged files will be listed.
 * @property {string[]} [ignoreList] - Optional. Array of file paths to ignore. Takes precedence over `ignoreFile` if both are provided.
 * @property {string} [ignoreFile] - Optional. Path to a file containing a list of files to ignore. Ignored if `ignoreList` is present.
 * @property {string} [upstreamBranch] - Name of the upstream branch. Defaults to `development`.
 * @property {Fork[]} [forks] - Optional. Array of fork reposotories.
 * @property {string} [forks.name] - Name of the fork repository. Only lowercase characters are allowed.
 * @property {string} [forks.remoteUrl] - Url to the fork repository.
 */

/**
 * Cella configuration file.
 * This configuration defines how the Cella scripts handle diverged and ignored files.
 *
 * @type {CellaConfig}
 */
export const config = {
  upstreamBranch: 'development',
  divergedFile: 'cella.diverged.txt',
  forks: [
    {
      name: 'fork',
      remoteUrl: 'git@github.com:cellajs/raak.git',
      branch: 'development',
    },
  ],
  ignoreList: [
    'README.md',
    'package.json',
    'pnpm-lock.yaml',
    'render.yaml',
    'compose.yaml',
    'cella.config.js',
    'info/*',
    'config/default.ts',
    'config/development.ts',
    'config/production.ts',
    'config/tunnel.ts',
    'cli/create-cella/*',
    'frontend/public/favicon.ico',
    'frontend/public/static/icons/*',
    'frontend/public/static/images/*',
    'frontend/public/static/logo/*',
    'frontend/public/static/screenshots/*',
    'frontend/src/nav-config.tsx',
    'frontend/src/menu-config.tsx',
    'frontend/src/alert-config.tsx',
    'frontend/src/offline-config.tsx',
    'frontend/src/gradients.css',
    'frontend/src/routes/route-tree.tsx',
    'frontend/src/routes/marketing.tsx',
    'frontend/src/lib/custom-events/app-types.ts',
    'frontend/src/modules/common/logo.tsx',
    'frontend/src/modules/common/bg-animation/*',
    'frontend/src/modules/home/onboarding/onboarding-config.ts',
    'frontend/src/modules/marketing/nav.tsx',
    'frontend/src/modules/marketing/footer.tsx',
    'frontend/src/modules/marketing/about/about-config.tsx',
    'frontend/src/modules/marketing/about/counters.tsx',
    'frontend/src/modules/marketing/about/hero.tsx',
    'frontend/src/modules/marketing/about/index.tsx',
    'frontend/src/modules/marketing/about/why.tsx',
    'frontend/src/modules/users/profile-page-content.tsx',
    'frontend/src/query/mutation-import-config.ts',
    'frontend/package.json',
    'backend/package.json',
    'backend/drizzle/*',
    'backend/src/db/attachments-schema-config.ts',
    'backend/scripts/seeds/data/*',
    'backend/src/routes.ts',
    'backend/src/entity-config.ts',
    'backend/src/lib/permission-manager.ts',
    'locales/en/about.json',
    'locales/en/app.json',
  ],
};
