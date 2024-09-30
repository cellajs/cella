/**
 * Cella configuration object.
 *
 * @typedef {Object} CellaConfig
 * @property {string} divergedFile - Path to the file where diverged files will be listed.
 * @property {string[]} [ignoreList] - Optional. Array of file paths to ignore. Takes precedence over `ignoreFile` if both are provided.
 * @property {string} [ignoreFile] - Optional. Path to a file containing a list of files to ignore. Ignored if `ignoreList` is present.
 */

/**
 * Cella configuration file.
 * This configuration defines how the Cella scripts handle diverged and ignored files.
 *
 * @type {CellaConfig}
 */
export const config = {
  upstreamBranch: 'development',
  divergedFile: 'scripts/cella.diverged.txt',
  ignoreList: [
    'README.md',
    'package.json',
    'pnpm-lock.yaml',
    'render.yaml',
    'cella.config.js',
    'info/*',
    'config/default.ts',
    'config/development.ts',
    'config/tunnel.ts',
    'frontend/vite.config.ts',
    'frontend/public/favicon.ico',
    'frontend/public/static/icons/*',
    'frontend/public/static/images/*',
    'frontend/public/static/logo/*',
    'frontend/public/static/screenshots/*',
    'frontend/src/nav-config.tsx',
    'frontend/src/alert-config.tsx',
    'frontend/src/gradients.css',
    'frontend/src/routes/index.tsx',
    'frontend/src/routes/marketing.tsx',
    'frontend/src/types/app.ts',
    'frontend/src/modules/app/*',
    'frontend/src/modules/home/onboarding-config.ts',
    'frontend/src/modules/marketing/about-config.tsx',
    'frontend/src/modules/marketing/nav.tsx',
    'frontend/src/modules/marketing/footer.tsx',
    'frontend/src/modules/marketing/about/counters.tsx',
    'frontend/src/modules/marketing/about/hero.tsx',
    'frontend/src/modules/marketing/about/index.tsx',
    'frontend/src/modules/marketing/about/why.tsx',
    'frontend/src/modules/users/profile-page-content.tsx',
    'backend/package.json',
    'backend/drizzle/*',
    'backend/scripts/seeds/data/*',
    'backend/src/routes.ts',
    'backend/src/types/app.ts',
    'backend/src/entity-config.ts',
    'locales/en/about.json',
    'locales/en/app.json',
  ],
};
