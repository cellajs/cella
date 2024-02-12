import { serve } from '@hono/node-server';
import cron from 'node-cron';

import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { env } from 'env';
import { resetDb } from './cron/reset-db';
import { db } from './db/db';
import { app } from './server';

// Set i18n instance with all translations on startup
import './lib/i18n';

const main = async () => {
  // Reset db every Sunday at midnight
  cron.schedule('0 0 * * 0', resetDb, { scheduled: true, timezone: 'UTC' }).start();

  // Migrate db
  await migrate(db, { migrationsFolder: 'drizzle' });

  // Start server
  serve(
    {
      fetch: app.fetch,
      hostname: '0.0.0.0',
      port: Number(env.PORT ?? '4000'),
    },
    (info) => {
      console.log(`Listening on http://${info.address}:${info.port}`);
    },
  );
};

main().catch((e) => {
  console.error('Failed to start server');
  console.error(e);
  process.exit(1);
});
