import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

/** Provides validated environment variables for the frontend. */
export const env = createEnv({
  client: {
    VITE_DEBUG_MODE: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    VITE_DEBUG_I18N: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    VITE_DEBUG_UI: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    VITE_MAPLE: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
  },
  clientPrefix: 'VITE_',
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});

/** Reports whether frontend debug mode is enabled. */
export const isDebugMode = env.VITE_DEBUG_MODE;

/** Reports whether Maple telemetry is opted in for local development. */
export const isMapleOptedIn = env.VITE_MAPLE;
