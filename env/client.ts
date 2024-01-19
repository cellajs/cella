import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  clientPrefix: 'VITE_',
  client: {
    VITE_BACKEND_URL: z.string().url().optional(),
    VITE_FRONTEND_URL: z.string().url().optional(),
    VITE_TUS_URL: z.string().url().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
