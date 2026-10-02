import { z } from '@hono/zod-openapi';
import { supportedOAuthProviders } from '#/modules/auth/oauth/identities-db';

const oauthFlowTypes = ['auth', 'connect', 'invite', 'verify'] as const;
export type OAuthFlowType = (typeof oauthFlowTypes)[number];

export const oauthQuerySchema = z.object({ type: z.enum(oauthFlowTypes).default('auth'), redirectAfter: z.string().optional() });

/** The state cookie of one round trip; `provider` is the provider whose start minted the state. */
export const oauthCookiePayloadSchema = z.object({
  provider: z.enum(supportedOAuthProviders),
  type: z.enum(oauthFlowTypes).default('auth'),
  redirectAfter: z.string().optional(),
  codeVerifier: z.string().optional(),
  nonce: z.string().optional(),
});

export type OAuthCookiePayload = z.infer<typeof oauthCookiePayloadSchema>;

/** A provider denial returns `error` and `state` without a `code` (RFC 6749 §4.1.2.1). */
export const oauthCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string(),
  error: z.string().optional(),
  error_description: z.string().optional(),
  error_uri: z.string().optional(),
});
