import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createEnv } from '@t3-oss/env-core';
import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Check if .env file exists
const isEnvFileExists = existsSync('.env');
if (!isEnvFileExists) {
  const isExampleEnvFileExists = existsSync('.env.example');
  if (!isExampleEnvFileExists) {
    throw new Error('Please create a .env file');
  }
  const exampleEnvFile = readFileSync('.env.example');
  writeFileSync('.env', exampleEnvFile);
  console.info('Created .env file');
}
dotenvConfig();

export const env = createEnv({
  server: {
    PGLITE: z
      .string()
      .optional()
      .transform((v) => v === 'true'),
    DATABASE_URL: z.string().url(),
    NODE_ENV: z.union([z.literal('development'), z.literal('production')]),
    PORT: z.string().optional(),
    UNSUBSCRIBE_TOKEN_SECRET: z.string(),

    ARGON_SECRET: z.string(),
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
    TUS_UPLOAD_API_SECRET: z.string().default('very_secret'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
