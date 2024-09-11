import { resetDb } from '#/cron/manage-db';

resetDb()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
