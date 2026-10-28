import { z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { federationKeys } from 'shared';
import type { BaseOAuthProviders } from 'shared/config-builder/types';
import type { Env } from '#/core/context';

const oauthProviderIds = ['github', 'google', 'microsoft'] as const satisfies readonly BaseOAuthProviders[];

const oauthFlowTypes = ['auth', 'connect', 'invite', 'verify'] as const;

export const oauthQuerySchema = z.object({ type: z.enum(oauthFlowTypes).default('auth'), redirectAfter: z.string().optional() });

/** The request of a route that starts a round trip, its query validated by `oauthQuerySchema`. */
export type OAuthStartContext = Context<Env, string, { out: { query: z.infer<typeof oauthQuerySchema> } }>;

/**
 * The state cookie of one round trip; `provider` is the OAuth provider or SSO federation whose start minted the
 * state, `connectionId` the institution an SSO start was pinned to.
 */
export const oauthCookiePayloadSchema = z.object({
  provider: z.enum([...oauthProviderIds, ...federationKeys]),
  type: z.enum(oauthFlowTypes).default('auth'),
  redirectAfter: z.string().optional(),
  codeVerifier: z.string().optional(),
  nonce: z.string().optional(),
  connectionId: z.string().optional(),
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

/** The request of a provider or federation callback, its query validated by `oauthCallbackQuerySchema`. */
export type OAuthCallbackContext = Context<Env, string, { out: { query: z.infer<typeof oauthCallbackQuerySchema> } }>;
