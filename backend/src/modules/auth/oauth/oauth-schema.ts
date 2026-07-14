import { z } from '@hono/zod-openapi';

const oauthFlowTypes = ['auth', 'connect', 'invite', 'verify'] as const;
export type OAuthFlowType = (typeof oauthFlowTypes)[number];

export const oauthQuerySchema = z.object({
  type: z.enum(oauthFlowTypes).default('auth'),
  redirectAfter: z.string().optional(),
});

export const oauthCookiePayloadSchema = z.object({
  type: z.enum(oauthFlowTypes).default('auth'),
  redirectAfter: z.string().optional(),
  codeVerifier: z.string().optional(),
  nonce: z.string().optional(),
  // Connect flow: the connecting user, pinned at initiation. The callback can't
  // read the session cookie (SameSite=Strict is not sent on the provider's
  // cross-site callback navigation), so it trusts this signed state payload.
  connectUserId: z.string().optional(),
});

export type OAuthCookiePayload = z.infer<typeof oauthCookiePayloadSchema>;

export const oauthCallbackQuerySchema = z.object({
  code: z.string(),
  state: z.string(),
});
