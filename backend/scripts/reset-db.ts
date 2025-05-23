import { resetDb } from './manage-db';

/**
 * Reset database with seed data, can't be used in production.
 */
resetDb()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
