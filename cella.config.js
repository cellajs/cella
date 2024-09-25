/**
 * Cella configuration object.
 *
 * @typedef {Object} CellaConfig
 * @property {string} divergentFile - Path to the file where divergent files will be listed.
 * @property {string[]} [ignoreList] - Optional. Array of file paths to ignore. Takes precedence over `ignoreFile` if both are provided.
 * @property {string} [ignoreFile] - Optional. Path to a file containing a list of files to ignore. Ignored if `ignoreList` is present.
 */

/**
 * Cella configuration file.
 * This configuration defines how the Cella scripts handle divergent and ignored files.
 *
 * @type {CellaConfig}
 */
export const config = {
  upstreamBranch: 'development',
  divergentFile: 'scripts/cella.divergent.txt',
  ignoreList: [
    'README.md',
    'backend/drizzle/*',
    'backend/package.json',
    'config/default.ts',
    'config/development.ts',
    'config/tunnel.ts',
    'frontend/public/favicon.ico',
    'frontend/public/static/icons/*',
    'frontend/public/static/images/*',
    'frontend/public/static/logo/*',
    'frontend/public/static/screenshots/*',
    'frontend/src/gradients.css',
    'frontend/src/modules/common/app-nav.tsx',
    'frontend/src/modules/common/logo.tsx',
    'frontend/src/modules/marketing/about/counters.tsx',
    'frontend/src/modules/marketing/about/hero.tsx',
    'frontend/src/modules/marketing/about/index.tsx',
    'frontend/src/modules/marketing/about/why.tsx',
    'frontend/src/modules/marketing/footer.tsx',
    'frontend/src/modules/users/profile-page-content.tsx',
    'frontend/src/routes/index.tsx',
    'frontend/src/types/app.ts',
    'locales/en/about.json',
    'package.json',
    'render.yaml',
  ],
};
