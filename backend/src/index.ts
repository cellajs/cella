import { serve } from '@hono/node-server';
import cron from 'node-cron';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '../env';
import { resetDb } from './cron/reset-db';
import { db } from './db/db';
import { db as dbElectric } from './db/db.electric';
import ascii from './lib/ascii';
import app from './server';
import { config } from 'config';

// Set i18n instance before starting server
import './lib/i18n';
// import { sdk } from './tracing';

const main = async () => {
  // Reset db every Sunday at midnight
  cron.schedule('0 0 * * 0', resetDb, { scheduled: true, timezone: 'UTC' }).start();

  // Migrate db
  await migrate(db, { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle-backend' });
  if (config.mode === 'development') await migrate(dbElectric, { migrationsFolder: 'drizzle-electric', migrationsSchema: 'drizzle-electric' });

  // Start server
  serve(
    {
      fetch: app.fetch,
      hostname: '0.0.0.0',
      port: Number(env.PORT ?? '4000'),
    },
    (info) => {
      console.info(`Listening on http://${info.address}:${info.port}`);
      ascii();
    },
  );
};

// sdk.start();
main().catch((e) => {
  console.error('Failed to start server');
  console.error(e);
  process.exit(1);
});
