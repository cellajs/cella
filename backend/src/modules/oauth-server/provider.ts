import { timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import Provider, { type Configuration, type KoaContextWithOIDC } from 'oidc-provider';
import { type AccessScope, type AccessScopedEntityType, accessScopes, appConfig } from 'shared';
import { baseDb } from '#/db/db';
import { env } from '#/env';
import { actorsTable } from '#/modules/actors/actors-db';
import { DrizzleAdapter } from '#/modules/oauth-server/adapter';
import { loadSigningJwks } from '#/modules/oauth-server/keystore';
import { parseResource } from '#/modules/oauth-server/resources';
import { apiKeysTable } from '#/modules/service-accounts/api-keys-db';
import { hashToken } from '#/utils/hash-token';
import { isExpiredDate } from '#/utils/is-expired-date';
import { log } from '#/utils/logger';

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/**
 * The scopes of the secret key a service account presented at the token endpoint, per request (null: an unscoped key).
 * Client authentication records it; the resource lookup that follows caps the token at it.
 */
const presentedKeyScopes = new WeakMap<object, readonly AccessScope[] | null>();

/**
 * The scopes a token may carry. A key narrows its service account and never widens it, so a service account's token
 * stays within the key it authenticated with (`write` covers `read`, as on the API); other clients may ask for all.
 */
function grantableScopes(ctx: object, client: unknown): readonly AccessScope[] {
  if ((client as { client_kind?: string } | undefined)?.client_kind !== 'service') return accessScopes.all;
  // No recorded key means client authentication did not run for this request: grant nothing.
  if (!presentedKeyScopes.has(ctx)) return [];
  const keyScopes = presentedKeyScopes.get(ctx);
  return accessScopes.all.filter((scope) => {
    const [type, verb] = scope.split(':') as [AccessScopedEntityType, 'read' | 'write'];
    return accessScopes.allows(keyScopes, type, verb === 'read' ? 'read' : 'update');
  });
}

/** Claims this server adds to every access token; the guard reads them to build the actor. */
export type IssuedTokenClaims = { actor_kind: 'user' | 'service'; tenant_id: string };

/**
 * The authorization server (D12): `node-oidc-provider` fed the app's keystore and store, narrowed to what the scenarios
 * need. Grant types: authorization code + PKCE, refresh, client credentials. Client auth: none (CIMD public clients)
 * and client_secret_basic (registered apps; service accounts with their secret keys). Client registration by Client ID
 * Metadata Document; no dynamic registration, no dev interactions, no logout endpoint.
 */
export async function createProvider(): Promise<Provider> {
  const jwks = await loadSigningJwks();

  const configuration: Configuration = {
    adapter: DrizzleAdapter,
    jwks,
    cookies: { keys: [env.COOKIE_SECRET], long: { signed: true }, short: { signed: true } },
    clientAuthMethods: ['none', 'client_secret_basic'],
    extraClientMetadata: { properties: ['client_kind'] },
    responseTypes: ['code'],
    // Entity scopes plus what a machine client asks for; `openid` stays out: this AS issues no id_tokens.
    scopes: [...accessScopes.all],
    pkce: { required: () => true },
    features: {
      devInteractions: { enabled: false },
      registration: { enabled: false },
      rpInitiatedLogout: { enabled: false },
      userinfo: { enabled: false },
      revocation: { enabled: true },
      clientCredentials: { enabled: true },
      clientIdMetadataDocument: { enabled: true, ack: 'draft-02' },
      resourceIndicators: {
        enabled: true,
        // Every token names its resource; a request without one gets `invalid_target` at the guard, never a broad token.
        defaultResource: () => undefined,
        useGrantedResource: () => true,
        getResourceServerInfo: (ctx, resourceIndicator, client) => {
          const resource = parseResource(resourceIndicator);
          if (!resource) throw new InvalidTarget();
          return {
            scope: grantableScopes(ctx, client).join(' '),
            audience: resourceIndicator,
            accessTokenFormat: 'jwt',
            accessTokenTTL: HOUR,
          };
        },
      },
    },
    ttl: {
      AccessToken: HOUR,
      AuthorizationCode: 10 * 60,
      ClientCredentials: HOUR,
      Grant: 30 * DAY,
      Interaction: 10 * 60,
      RefreshToken: 30 * DAY,
      Session: DAY,
    },
    // Refresh tokens whenever the client may use them; MCP clients do not always ask for `offline_access`.
    issueRefreshToken: (_ctx, client) => client.grantTypeAllowed('refresh_token'),
    rotateRefreshToken: true,
    interactions: {
      // Same origin as the API: the interaction cookie is scoped to this path, and the page under it reads the session.
      url: (_ctx, interaction) => `/oauth/interaction/${interaction.uid}`,
    },
    findAccount: async (_ctx, sub) => {
      const [actor] = await baseDb.select().from(actorsTable).where(eq(actorsTable.id, sub)).limit(1);
      if (actor?.kind !== 'user') return undefined;
      return { accountId: sub, claims: async () => ({ sub }) };
    },
    extraTokenClaims: (_ctx, token) => {
      const aud = Array.isArray(token.aud) ? token.aud[0] : token.aud;
      const resource = parseResource(aud ?? '');
      // A token without one of this deployment's resources is never minted; the verifier would refuse it anyway.
      if (!resource) throw new InvalidTarget();
      const claims: IssuedTokenClaims = {
        actor_kind: 'accountId' in token && token.accountId ? 'user' : 'service',
        tenant_id: resource.tenantId,
      };
      return claims;
    },
    renderError: async (ctx, out, error) => {
      // A client's own mistake (bad PKCE, expired code, refusal) is request noise; only the server's faults are warnings.
      const level = ctx.status >= 500 ? 'warn' : 'info';
      log[level]('OAuth server error', {
        error: out.error,
        description: out.error_description,
        ...(level === 'warn' && { err: error }),
      });
      ctx.type = 'json';
      ctx.body = out;
    },
  };

  const provider = new Provider(appConfig.oauthUrl, configuration);
  provider.proxy = true;

  // Secrets are never stored in plaintext: a registered app's secret is compared by hash, a service account's client
  // secret is any of its live secret keys, whose scopes then cap the token (`grantableScopes`).
  provider.Client.prototype.compareClientSecret = async function compare(
    this: { clientId: string; clientSecret?: string; client_kind?: string },
    actual: string,
  ) {
    const presented = hashToken(actual);
    if (this.client_kind === 'service') {
      const keys = await baseDb
        .select({ hash: apiKeysTable.hash, expiresAt: apiKeysTable.expiresAt, scopes: apiKeysTable.scopes })
        .from(apiKeysTable)
        .where(and(eq(apiKeysTable.actorId, this.clientId), isNull(apiKeysTable.revokedAt)));
      const key = keys.find((k) => (!k.expiresAt || !isExpiredDate(k.expiresAt)) && safeEqual(k.hash, presented));
      if (!key) return false;
      const ctx = Provider.ctx;
      if (ctx) presentedKeyScopes.set(ctx, key.scopes ?? null);
      return true;
    }
    return typeof this.clientSecret === 'string' && safeEqual(this.clientSecret, presented);
  };

  return provider;
}

class InvalidTarget extends Error {
  readonly error = 'invalid_target';
  readonly status = 400;
  readonly statusCode = 400;
  readonly expose = true;
  constructor() {
    super('invalid_target');
    this.name = 'InvalidTarget';
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type ProviderContext = KoaContextWithOIDC;
