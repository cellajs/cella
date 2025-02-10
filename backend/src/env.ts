import { env as dotenv } from '@dotenv-run/core';
import { createEnv } from '@t3-oss/env-core';
import { config } from 'config';
import { z } from 'zod';

dotenv({
  root: '../..',
  verbose: config.debug,
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
    DATABASE_URL: z.string().url(),
    NODE_ENV: z.union([z.literal('development'), z.literal('production'), z.literal('test')]),
    PORT: z.string().optional(),
    UNSUBSCRIBE_SECRET: z.string(),

    ARGON_SECRET: z.string(),
    COOKIE_SECRET: z.string(),
    REMOTE_SYSTEM_ACCESS_IP: z.string(),

    NOVU_API_KEY: z.string().optional(),
    NOVU_SUB_ID: z.string().optional(),
    NOVU_SLACK_WEBHOOK: z.string().optional(),

    SEND_ALL_TO_EMAIL: z.string().optional(),
    SENDGRID_API_KEY: z.string().optional(),

    PADDLE_API_KEY: z.string().optional(),
    PADDLE_WEBHOOK_KEY: z.string().optional(),

    LOGTAIL_TOKEN: z.string().optional(),

    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    MICROSOFT_TENANT_ID: z.string().optional(),
    MICROSOFT_CLIENT_ID: z.string().optional(),
    MICROSOFT_CLIENT_SECRET: z.string().optional(),

    AWS_S3_UPLOAD_ACCESS_KEY_ID: z.string().default(''),
    AWS_S3_UPLOAD_SECRET_ACCESS_KEY: z.string().default(''),
    AWS_CLOUDFRONT_KEY_ID: z.string().default(''),
    AWS_CLOUDFRONT_PRIVATE_KEY: z.string().default(''),
    TUS_SECRET: z.string().default('very_secret'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
