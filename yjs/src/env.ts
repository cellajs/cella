import { appConfig } from 'shared';
import { loadBackendDotenv, workerEnvBase } from 'shared/utils/worker-env';
import { z } from 'zod';

loadBackendDotenv();

const envSchema = workerEnvBase.extend({
  DATABASE_URL: z.url(),

  YJS_SECRET: z.string().min(16, 'YJS_SECRET must be at least 16 characters'),
  // Authenticates the relay on the backend's internal materialize route.
  YJS_RELAY_SECRET: z.string().min(16, 'YJS_RELAY_SECRET must be at least 16 characters'),
  // The backend's internal listener; its routes are not on the public API.
  BACKEND_INTERNAL_URL: z.url().default(`http://localhost:${appConfig.devPorts.internal}`),
  YJS_PORT: z.coerce.number().default(appConfig.devPorts.yjs),
  YJS_DB_POOL_MAX: z.coerce.number().default(20),

  NODB: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

export const env = envSchema.parse(process.env);
