import { organizationsSeed } from './seed';

/**
 * Run organizations seed script.
 */
organizationsSeed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
