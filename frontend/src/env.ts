import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const flag = z
  .string()
  .default('false')
  .transform((value) => value === 'true');

export const env = createEnv({
  client: { VITE_DEBUG_MODE: flag, VITE_DEBUG_I18N: flag, VITE_DEBUG_UI: flag, VITE_MAPLE: flag },
  clientPrefix: 'VITE_',
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});

export const isDebugMode = env.VITE_DEBUG_MODE;

/** Reports whether Maple telemetry is opted in for local development. */
export const isMapleOptedIn = env.VITE_MAPLE;
