import { resetDb } from '../src/cron/reset-db';

resetDb()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
