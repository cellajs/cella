import { z } from '@hono/zod-openapi';

export const oauthQuerySchema = z.object({
  type: z.enum(['auth', 'connect', 'invite', 'verify']),
  redirect: z.string().optional(),
});

export const oauthCallbackQuerySchema = z.object({
  code: z.string(),
  state: z.string(),
});
