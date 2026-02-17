import { env as dotenv } from '@dotenv-run/core';
import { createEnv } from '@t3-oss/env-core';
import { appConfig } from 'shared';
import { z } from 'zod';
import { additionalEnvSchema } from '#/custom-env';
import { severityLevels } from '#/schemas/api-error-schemas';

dotenv({
  root: '../..',
  verbose: appConfig.debug,
  files: ['.env'],
});

/**
 * Environment variables validated with zod
 */
export const env = createEnv({
  server: {
    DEV_MODE: z.enum(['none', 'basic', 'core', 'full']).default('core'),
    DEBUG: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    DATABASE_URL: z.url(),
    /** Admin database URL (superuser). Used for migrations and seeds only. */
    DATABASE_ADMIN_URL: z.url(),
    NODE_ENV: z.union([
      z.literal('development'),
      z.literal('production'),
      z.literal('staging'),
      z.literal('tunnel'),
      z.literal('test'),
    ]),
    PORT: z.string().optional(),
    UNSUBSCRIBE_SECRET: z.string(),

    TUNNEL_URL: z.string().default(''),
    TUNNEL_AUTH_TOKEN: z.string().default(''),

    ARGON_SECRET: z.string(),
    COOKIE_SECRET: z.string(),

    REMOTE_SYSTEM_ACCESS_IP: z.string(),

    SEND_ALL_TO_EMAIL: z.string().optional(),
    BREVO_API_KEY: z.string().optional(),

    PADDLE_API_KEY: z.string().optional(),
    PADDLE_WEBHOOK_KEY: z.string().optional(),

    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    MICROSOFT_TENANT_ID: z.string().optional(),
    MICROSOFT_CLIENT_ID: z.string().optional(),
    MICROSOFT_CLIENT_SECRET: z.string().optional(),

    TRANSLOADIT_KEY: z.string().optional(),
    TRANSLOADIT_SECRET: z.string().optional(),

    S3_ACCESS_KEY_ID: z.string().default(''),
    S3_ACCESS_KEY_SECRET: z.string().default(''),

    ELEMENT_ROOM_ID: z.string().optional(),
    ELEMENT_BOT_ACCESS_TOKEN: z.string().optional(),

    // CDC Worker WebSocket authentication (required in full/production mode)
    CDC_INTERNAL_SECRET: z
      .string()
      .min(16, 'CDC_INTERNAL_SECRET must be at least 16 characters')
      .optional()
      .refine(
        (val) => {
          // Required in full mode or production
          const devMode = process.env.DEV_MODE ?? 'core';
          const nodeEnv = process.env.NODE_ENV ?? 'development';
          if (devMode === 'full' || nodeEnv === 'production') {
            return !!val;
          }
          return true;
        },
        { message: 'CDC_INTERNAL_SECRET is required in full mode or production' },
      ),

    PINO_LOG_LEVEL: z
      .enum([...severityLevels, 'silent'])
      .default(appConfig.mode === 'test' ? 'silent' : appConfig.mode === 'production' ? 'info' : 'debug'),

    ...additionalEnvSchema.shape,
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  // Skip validation when running in Vitest (env vars set by vitest.config.ts test.env)
  // This allows vitest workspace to import tests before env vars are fully configured
  skipValidation: !!process.env.VITEST,
});
