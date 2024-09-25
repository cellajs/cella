import { serve } from '@hono/node-server';
import cron from 'node-cron';

import { migrate as pgMigrate } from 'drizzle-orm/node-postgres/migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate as pgliteMigrate } from 'drizzle-orm/pglite/migrator';
import { resetDb } from '#/cron/manage-db';
import { db } from '#/db/db';
import ascii from '#/lib/ascii';
import { env } from '../env';
import docs from './lib/docs';
import app from './routes';

// Set i18n instance before starting server
import chalk from 'chalk';
import { config } from 'config';
import './lib/i18n';
// import { sdk } from './tracing';

const isPGliteDatabase = (_db: unknown): _db is PgliteDatabase => !!env.PGLITE;

// Init OpenAPI docs
docs(app);

const main = async () => {
  // Reset db every Sunday at midnight
  cron.schedule('0 0 * * 0', resetDb, { scheduled: true, timezone: 'UTC' }).start();

  // Migrate db
  const migrateConfig = {
    migrationsFolder: 'drizzle',
    migrationsSchema: 'drizzle-backend',
  };
  if (isPGliteDatabase(db)) {
    await pgliteMigrate(db, migrateConfig);
  } else {
    await pgMigrate(db, migrateConfig);
  }

  // Start server
  serve(
    {
      fetch: app.fetch,
      hostname: '0.0.0.0',
      port: Number(env.PORT ?? '4004'),
    },
    () => {
      ascii();
      console.info(
        `Open ${chalk.greenBright.bold(config.name)} on ${chalk.cyanBright(config.frontendUrl)}. Backend on ${chalk.cyanBright(config.backendUrl)}`,
      );
      console.info(`Read API docs on ${chalk.cyanBright(`${config.backendUrl}/docs`)}`);
    },
  );
};

// sdk.start();
main().catch((e) => {
  console.error('Failed to start server');
  console.error(e);
  process.exit(1);
});
