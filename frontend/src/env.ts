import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod/v4';

export const env = createEnv({
  client: {
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
