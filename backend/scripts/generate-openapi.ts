process.env.DEV_MODE = 'none';

import { checkMark, crossMark } from '#/utils/console';

/**
 * Generate OpenAPI documentation and save it to a file.
 *
 * This script initializes the OpenAPI documentation for the application,
 * registers necessary schemas, and writes the generated OpenAPI document
 * to a JSON file. DEV_MODE is set to 'none' to avoid database connections during generation.
 */
(async () => {
  try {
    const [{ default: app }, { default: docs }] = await Promise.all([
      import('#/routes'),
      import('#/docs/docs'),
    ]);

    await docs(app, true);
    process.exit(0);
  } catch (err) {
    console.error(`${crossMark} Failed to generate fresh OpenAPI cache`);
    if (err instanceof Error) console.error(err.message.includes('DEV_MODE') ? `${checkMark} Continuing without DB access` : err.stack || err.message);
    else console.error(err);
    process.exit(1);
  }
})();