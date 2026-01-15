import { z } from '@hono/zod-openapi';

const oauthFlowTypes = ['auth', 'connect', 'invite', 'verify'] as const;
export type OAuthFlowType = (typeof oauthFlowTypes)[number];

export const oauthQuerySchema = z.object({
  type: z.enum(oauthFlowTypes).default('auth'),
  redirectAfter: z.string().optional(),
});

export const oauthCallbackQuerySchema = z.object({
  code: z.string(),
  state: z.string(),
});
