import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { baseDb as db, migrateConfig } from '#/db/db';
import { checkMark } from '#/utils/console';

// Migrate the database
await migrate(db, migrateConfig);

const res = await db.execute(sql`SELECT * FROM users`);

if (res.rows.length > 0) {
  console.info(' ');
  console.info(`${checkMark} Database is already seeded`);
  console.info(' ');
  process.exit(0);
}

import { seedScripts } from './scripts-discovery';

for (const seed of seedScripts) {
  try {
    await seed.run();
  } catch (error) {
    console.error(`Error running seed: ${seed.name}`, error);
    process.exit(1);
  }
}
