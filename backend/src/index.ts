import { serve } from '@hono/node-server';

import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { env } from 'env';
import { db } from './db/db';
import { app } from './server';

const main = async () => {
  await migrate(db, { migrationsFolder: 'drizzle' });

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
