import { pagesSeed } from './seed';

/**
 * Run pages seed script.
 */
pagesSeed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
