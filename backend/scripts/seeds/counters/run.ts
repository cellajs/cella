import { countersSeed } from './seed';

/**
 * Run counters seed script.
 */
countersSeed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .then(() => process.exit(0));
