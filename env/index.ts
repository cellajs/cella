import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env =  createEnv({
  clientPrefix: 'VITE_',
  client: {
    VITE_BACKEND_URL: z.string().url().optional(),
    VITE_FRONTEND_URL: z.string().url().optional(),
    VITE_TUS_URL: z.string().url().optional(),
  },
  server: {
    DATABASE_URL: z.string().url().optional(),
    PORT: z.string().optional(),

    SENDGRID_API_KEY: z.string().optional(),

    APPSIGNAL_BACKEND_KEY: z.string().optional(),

    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    MICROSOFT_TENANT_ID: z.string().optional(),
    MICROSOFT_CLIENT_ID: z.string().optional(),
    MICROSOFT_CLIENT_SECRET: z.string().optional(),

    AWS_S3_UPLOAD_ACCESS_KEY_ID: z.string().optional(),
    AWS_S3_UPLOAD_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_CLOUDFRONT_KEY_ID: z.string().optional(),
    AWS_CLOUDFRONT_PRIVATE_KEY: z.string().optional(),
    TUS_UPLOAD_API_SECRET: z.string().default('very_secret'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
