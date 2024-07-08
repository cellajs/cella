import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { db } from './db';

async function main() {
  console.info('Running migrations');

  await migrate(db, { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle-backend' });

  console.info('Migrated successfully');

  process.exit(0);
}

main().catch((e) => {
  console.error('Migration failed');
  console.error(e);
  process.exit(1);
});