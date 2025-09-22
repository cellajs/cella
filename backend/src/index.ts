import { db, migrateConfig } from '#/db/db';
import docs from '#/lib/docs';
import { AppError } from '#/lib/errors';
import '#/lib/i18n';
import { serve } from '@hono/node-server';
import * as ErrorTracker from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import chalk from 'chalk';
import { appConfig } from 'config';
import { migrate as pgMigrate } from 'drizzle-orm/node-postgres/migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate as pgliteMigrate } from 'drizzle-orm/pglite/migrator';
import app from '#/routes';
import { ascii } from '#/utils/ascii';
import { env } from './env';

const startTunnel = appConfig.mode === 'tunnel' ? (await import('#/lib/start-tunnel')).default : () => null;

const isPGliteDatabase = (_db: unknown): _db is PgliteDatabase => !!env.PGLITE;

// Init OpenAPI docs
docs(app);

// Init monitoring instance
ErrorTracker.init({
  enabled: !!appConfig.errorTrackerDsn,
  dsn: appConfig.errorTrackerDsn,
  beforeSend: (event, hint) => {
    const error = hint?.originalException;

    if (error) {
      if (error instanceof AppError) {
        // Handle AppError first, because it likely extends Error
        event.fingerprint = [error.name, error.message, error.status.toString()];
      } else if (error instanceof Error) {
        // Generic Error
        event.fingerprint = [error.name, error.message];
      } else {
        // Fallback for non-Error exceptions (strings, objects, etc.)
        event.fingerprint = [String(error)];
      }
    }

    return event;
  },
  environment: appConfig.mode,
  integrations: [nodeProfilingIntegration()],
  // Tracing to capture 100% of transactions
  tracesSampleRate: 1.0,
  // Set sampling rate for profiling - this is evaluated only once per SDK.init call
  profileSessionSampleRate: 1.0,
  // Trace lifecycle automatically enables profiling during active traces
  profileLifecycle: 'trace',
});

const main = async () => {
  // Migrate db
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
    async (info) => {
      const tunnelUrl = await startTunnel(info);

      ascii();
      console.info(' ');

      console.info(`${chalk.greenBright.bold(appConfig.name)} 
Frontend: ${chalk.cyanBright.bold(appConfig.frontendUrl)} 
Backend: ${chalk.cyanBright.bold(appConfig.backendUrl)} 
Tunnel: ${chalk.magentaBright.bold(tunnelUrl || '-')}
Docs: ${chalk.cyanBright(`${appConfig.backendUrl}/docs`)}`);

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
