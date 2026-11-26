import { envFlag, parseEnv } from 'shared/utils/parse-env';
import { z } from 'zod';

const envSchema = z.object({
  VITE_DEBUG: envFlag('false'),
  VITE_DEBUG_I18N: envFlag('false'),
  /** The DSN this machine's development and tunnel pages report to in place of their config's; no other mode reads it. */
  VITE_MONITORING_DSN: z.url({ protocol: /^https?$/ }).optional(),
});

export const env = parseEnv(envSchema, import.meta.env);

export const isDebugMode = env.VITE_DEBUG;
