import app from '#/routes';
import docs from '#/lib/docs';

/** * Generate OpenAPI documentation and save it to a file.
 *
 * This script initializes the OpenAPI documentation for the application,
 * registers necessary schemas, and writes the generated OpenAPI document
 * to a JSON file.
 */
(async () => {
  try {
    await docs(app, true);
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to generate OpenAPI cache');
    console.error(err);
    process.exit(1);
  }
})();
