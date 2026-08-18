import { appConfig } from 'shared';
import { loadBackendDotenv, workerEnvBase } from 'shared/utils/worker-env';
import { z } from 'zod';

loadBackendDotenv();

const envSchema = workerEnvBase.extend({
  DATABASE_URL: z.url(),

  YJS_SECRET: z.string().min(16, 'YJS_SECRET must be at least 16 characters'),
  YJS_PORT: z.coerce.number().default(appConfig.devPorts.yjs),
  YJS_DB_POOL_MAX: z.coerce.number().default(20),

  NODB: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

export const env = envSchema.parse(process.env);
