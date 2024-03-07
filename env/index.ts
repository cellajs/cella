import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url().optional(),
    PORT: z.string().optional(),

    SEND_ALL_TO_EMAIL: z.string().optional(),
    SENDGRID_API_KEY: z.string().optional(),

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
