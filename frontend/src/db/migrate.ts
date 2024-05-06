import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { db } from './db';

async function main() {
  console.info('Running migrations');

  await migrate(db, { migrationsFolder: 'drizzle' });

  console.info('Migrated successfully');
}

main().catch((e) => {
  console.error('Migration failed');
  console.error(e);
  process.exit(1);
});
