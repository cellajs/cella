import { appConfig } from 'shared';
import { localDatabaseUrl } from 'shared/local-database';
import { parseEnv } from 'shared/utils/parse-env';
import { loadRootEnv, workerEnvBase } from 'shared/utils/worker-env';
import { z } from 'zod';

loadRootEnv(import.meta.url);

const envSchema = workerEnvBase.extend({
  // Reads the replication stream and writes what a change leaves: its role needs REPLICATION and an effective RLS
  // bypass. A local stack defaults to the dev container; a deployed one receives it as a runtime secret.
  DATABASE_CDC_URL: appConfig.isLocal ? z.url().default(localDatabaseUrl('dev', 'admin_role')) : z.url(),

  // The backend's internal listener, an http base; the CDC socket is its `/internal/cdc` route.
  BACKEND_INTERNAL_URL: z.url().default(`http://localhost:${appConfig.services.backend.internalPort}`),
  // Authenticates the worker on that socket.
  CDC_SECRET: z.string().min(16, 'CDC_SECRET must be at least 16 characters'),
});

/** The worker's environment, validated when the module loads: a missing or malformed variable stops it at start. */
export const env = parseEnv(envSchema, process.env);
