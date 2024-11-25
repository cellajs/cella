import { clearDb } from '#/cron/manage-db';

clearDb()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
