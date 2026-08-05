import { loadBackendDotenv, workerEnvBase } from 'shared/utils/worker-env';
import { z } from 'zod';

loadBackendDotenv();

const envSchema = workerEnvBase.extend({
  DATABASE_URL: z.url(),

  YJS_SECRET: z.string().min(16, 'YJS_SECRET must be at least 16 characters'),
  // Static default: yjsUrl is the public URL (a path under the app origin, no port).
  YJS_PORT: z.coerce.number().default(4002),
  YJS_DB_POOL_MAX: z.coerce.number().default(20),

  NODB: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

/**
 * Validated environment variables for Yjs Worker.
 */
export const env = envSchema.parse(process.env);
