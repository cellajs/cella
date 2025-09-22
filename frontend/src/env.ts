import { createEnv } from '@t3-oss/env-core';
import { appConfig } from 'config';
import { z } from 'zod';

export const env = createEnv({
  client: {
    VITE_STATISTIC_DEBUG_DOMAIN: z
      .string()
      .default(appConfig.domain)
      .refine((v) => !v || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v), 'Must be a valid domain if set'),
    VITE_DEBUG_UI: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    VITE_QUICK: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    VITE_DEBUG_I18N: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
  },
  clientPrefix: 'VITE_',
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
