import { execSync } from 'node:child_process';
import { config } from 'config';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { db } from '#/db/db';

// Migrate the database
await migrate(db, { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle-backend' });

const res = await db.execute(sql`SELECT * FROM users`);

if (res.rows.length > 0) {
  console.info('Database is already seeded');
  process.exit(0);
}

for (const cmd of config.seedScripts) {
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error executing command: ${cmd}`, error);
    process.exit(1);
  }
}
