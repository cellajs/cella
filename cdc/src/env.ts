import { appConfig } from 'shared';
import { loadBackendDotenv, workerEnvBase } from 'shared/utils/worker-env';
import { z } from 'zod';

loadBackendDotenv();

const envSchema = workerEnvBase.extend({
  DATABASE_CDC_URL: z.url(),

  // backendUrl is the public URL; the internal CDC socket targets the backend's own listen port.
  API_WS_URL: z.url().default(`ws://localhost:${appConfig.devPorts.api}/internal/cdc`),
  CDC_SECRET: z.string().min(16, 'CDC_SECRET must be at least 16 characters'),
  CDC_HEALTH_PORT: z.coerce.number().default(appConfig.devPorts.cdcHealth),
});

export const env = envSchema.parse(process.env);
