import { env as dotenv } from '@dotenv-run/core';
import { createEnv } from '@t3-oss/env-core';
import { appConfig, type Severity } from 'config';
import { z } from 'zod';
import { additionalEnvSchema } from '#/custom-env';

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
    PGLITE: z
      .string()
      .optional()
      .transform((v) => v === 'true'),
    DATABASE_URL: z.url(),
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

    ELECTRIC_API_SECRET: z.string(),

    REMOTE_SYSTEM_ACCESS_IP: z.string(),

    NOVU_API_KEY: z.string().optional(),
    NOVU_SLACK_WEBHOOK: z.string().optional(),

    SEND_ALL_TO_EMAIL: z.string().optional(),
    BREVO_API_KEY: z.string().optional(),

    PADDLE_API_KEY: z.string().optional(),
    PADDLE_WEBHOOK_KEY: z.string().optional(),

    BETTERSTACK_SOURCE_TOKEN: z.string().optional(),
    BETTERSTACK_INGESTING_HOST: z.string().optional(),

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

    PINO_LOG_LEVEL: z
      .enum([...(Object.keys(appConfig.severityLevels) as [Severity, ...Severity[]]), 'silent'])
      .default(appConfig.mode === 'test' ? 'silent' : appConfig.mode === 'production' ? 'info' : 'debug'),

    ...additionalEnvSchema.shape,
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
