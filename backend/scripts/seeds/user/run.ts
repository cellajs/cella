import { userSeed } from './seed';

/**
 * Run user seed script.
 */
userSeed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
