import { dataSeed } from './seed';

/**
 * Run data seed script.
 */
dataSeed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
