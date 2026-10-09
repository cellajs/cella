import { appConfig } from 'shared';
import { loadBackendDotenv, workerEnvBase } from 'shared/utils/worker-env';
import { z } from 'zod';

loadBackendDotenv();

const envSchema = workerEnvBase.extend({
  // Reads the replication stream and writes what a change leaves: its role needs REPLICATION and an effective RLS bypass.
  DATABASE_CDC_URL: z.url(),

  // The backend's internal listener, an http base; the CDC socket is its `/internal/cdc` route.
  BACKEND_INTERNAL_URL: z.url().default(`http://localhost:${appConfig.devPorts.internal}`),
  // Authenticates the worker on that socket.
  CDC_SECRET: z.string().min(16, 'CDC_SECRET must be at least 16 characters'),
  CDC_HEALTH_PORT: z.coerce.number().default(appConfig.devPorts.cdcHealth),
});

export const env = envSchema.parse(process.env);
