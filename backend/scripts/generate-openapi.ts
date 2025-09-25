process.env.NODE_ENV = 'test';

/** * Generate OpenAPI documentation and save it to a file.
 *
 * This script initializes the OpenAPI documentation for the application,
 * registers necessary schemas, and writes the generated OpenAPI document
 * to a JSON file. For this to work, the mode is set to 'test' with PGLITE=true
 * to avoid any real database connections during the generation process.
 */
(async () => {
  try {
    const [{ default: app }, { default: docs }] = await Promise.all([
      import('#/routes'),
      import('#/lib/docs'),
    ]);

    await docs(app, true);
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to generate fresh OpenAPI cache');
    if (err instanceof Error) console.error(err.message.includes('SKIP_DB') ? '✅ Continuing without DB access' : err.stack || err.message);
    else console.error(err);
    process.exit(1);
  }
})();