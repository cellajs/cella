import { clearDb } from './manage-db';

/**
 * Wipes the entire database, can't be used in production.
 */
clearDb()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
