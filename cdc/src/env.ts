import { loadBackendDotenv, workerEnvBase } from 'shared/utils/worker-env';
import { z } from 'zod';

loadBackendDotenv();

const envSchema = workerEnvBase.extend({
  DATABASE_CDC_URL: z.url(),

  // Static default: backendUrl is the public URL (a path under the app origin, no
  // port); the internal CDC socket always targets the backend's own listen port.
  API_WS_URL: z.url().default('ws://localhost:4000/internal/cdc'),
  CDC_SECRET: z.string().min(16, 'CDC_SECRET must be at least 16 characters'),
  CDC_HEALTH_PORT: z.coerce.number().default(4001),
});

/**
 * Validated environment variables for CDC Worker.
 */
export const env = envSchema.parse(process.env);
