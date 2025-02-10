import { serve } from '@hono/node-server';

import chalk from 'chalk';
import { config } from 'config';
import { migrate as pgMigrate } from 'drizzle-orm/node-postgres/migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate as pgliteMigrate } from 'drizzle-orm/pglite/migrator';
import { db } from '#/db/db';
import ascii from '#/utils/ascii';
import { env } from './env';
import docs from './lib/docs';
import app from './routes';
import './lib/i18n';
// import { sdk } from './tracing';

const isPGliteDatabase = (_db: unknown): _db is PgliteDatabase => !!env.PGLITE;

// Init OpenAPI docs
docs(app);

const main = async () => {
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
      port: Number(env.PORT ?? '4000'),
    },
    () => {
      ascii();
      console.info(' ');
      console.info(
        `${chalk.greenBright.bold(config.name)} (Frontend) runs on ${chalk.cyanBright.bold(config.frontendUrl)}. Backend: ${chalk.cyanBright.bold(config.backendUrl)}. Docs: ${chalk.cyanBright(`${config.backendUrl}/docs`)}`,
      );
      console.info(' ');
    },
  );
};

// sdk.start();
main().catch((e) => {
  console.error('Failed to start server');
  console.error(e);
  process.exit(1);
});
