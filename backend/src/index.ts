import { createSecureServer } from 'node:http2';

import { serve } from '@hono/node-server';

import { migrate as pgMigrate } from 'drizzle-orm/node-postgres/migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate as pgliteMigrate } from 'drizzle-orm/pglite/migrator';

import { db } from '#/db/db';
import ascii from '#/utils/ascii';
import { env } from '../env';
import docs from './lib/docs';
import app from './routes';

// Set i18n instance before starting server
import chalk from 'chalk';
import { config } from 'config';
import './lib/i18n';
import { certs } from './utils/certs';
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
  const { key, cert } = env.NODE_ENV === 'development' && env.DEVELOPMENT_SECURE_HTTP2 ? (await certs()) || {} : {};
  const port = Number(env.PORT ?? '4000');
  const hostname = '0.0.0.0';

  // Start server
  serve(
    {
      fetch: app.fetch,
      createServer: key ? createSecureServer : undefined,
      hostname,
      port,
      serverOptions: {
        key,
        cert,
      },
    },
    () => {
      config.backendUrl = key ? `https://${hostname}:${port}` : config.backendUrl;
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
