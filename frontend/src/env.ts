import { envFlag, parseEnv } from 'shared/utils/parse-env';
import { z } from 'zod';

const envSchema = z.object({
  VITE_DEBUG: envFlag('false'),
  VITE_DEBUG_I18N: envFlag('false'),
  VITE_MAPLE: envFlag('false'),
});

export const env = parseEnv(envSchema, import.meta.env);

export const isDebugMode = env.VITE_DEBUG;

/** Reports whether Maple telemetry is opted in for local development. */
export const isMapleOptedIn = env.VITE_MAPLE;
