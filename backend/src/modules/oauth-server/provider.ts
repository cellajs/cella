import { and, eq, isNull } from 'drizzle-orm';
import Provider, { type Configuration, errors, type KoaContextWithOIDC } from 'oidc-provider';
import { type AccessScope, type AccessScopedEntityType, accessScopes, appConfig } from 'shared';
import { safeEqual } from 'shared/utils/safe-equal';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { chargeLimiter } from '#/middlewares/rate-limiter/helpers';
import { clientMetadataFetchLimiter } from '#/middlewares/rate-limiter/limiters';
import { cookieSecrets } from '#/modules/auth/general/helpers/cookie';
import { DrizzleAdapter } from '#/modules/oauth-server/adapter';
import { grantRefusal } from '#/modules/oauth-server/grant-policy';
import { appInteractionPolicy } from '#/modules/oauth-server/interaction-policy';
import { loadSigningJwks } from '#/modules/oauth-server/keystore';
import { parseResource } from '#/modules/oauth-server/resources';
import { revokeGrant } from '#/modules/oauth-server/revoke-grant';
import { apiKeysTable } from '#/modules/service-accounts/api-keys-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { usersTable } from '#/modules/user/user-db';
import { hashToken } from '#/utils/hash-token';
import { isExpiredDate } from '#/utils/is-expired-date';
import { log } from '#/utils/logger';

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/**
 * The secret key a service account presented at the token endpoint, per request (null scopes: an unscoped key), with the
 * account's tenant. Client authentication records it; the resource lookup that follows keeps the token in that tenant
 * and caps it at the key's scopes, and the token names the key.
 */
const presentedKeys = new WeakMap<object, { id: string; scopes: readonly AccessScope[] | null; tenantId: string }>();

const isServiceClient = (client: unknown) =>
  (client as { client_kind?: string } | undefined)?.client_kind === 'service';

/**
 * The scopes a token may carry. A key narrows its service account and never widens it, so a service account's token
 * stays within the key it authenticated with (`write` covers `read`, as on the API); other clients may ask for all.
 */
function grantableScopes(ctx: object, client: unknown): readonly AccessScope[] {
  if (!isServiceClient(client)) return accessScopes.all;
  const key = presentedKeys.get(ctx);
  // No recorded key means client authentication did not run for this request: grant nothing.
  if (!key) return [];
  return accessScopes.all.filter((scope) => {
    const [type, verb] = scope.split(':') as [AccessScopedEntityType, 'read' | 'write'];
    return accessScopes.allows(key.scopes, type, verb === 'read' ? 'read' : 'update');
  });
}

/**
 * Claims this server adds to every access token; the guard reads them to build the actor, and asks the grant policy
 * about the grant (`gid`) or API key (`key_id`) the token rests on.
 */
export type IssuedTokenClaims =
  | { actor_kind: 'user'; tenant_id: string; gid: string }
  | { actor_kind: 'service'; tenant_id: string; key_id: string };

/** The code or refresh token a grant is used through at the token endpoint, as `findAccount` receives it. */
type GrantSource = { clientId?: string; grantId?: string; resource?: unknown };

/**
 * Whether a code exchange or refresh may go on for this account, by the grant policy for every tenant the token names.
 * A refused grant is deleted with every token issued under it, so the client must ask the person again. A code or
 * refresh token that names none of this deployment's resources mints nothing, and its grant stays. The authorization
 * endpoint asks without a token, about its session's account: the user only has to exist.
 */
async function accountMayUseGrant(sub: string, source: GrantSource | undefined): Promise<boolean> {
  if (!source) {
    const [user] = await baseDb.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, sub)).limit(1);
    return !!user;
  }
  const tenantIds = [source.resource]
    .flat()
    .map((uri) => (typeof uri === 'string' ? parseResource(uri)?.tenantId : null));
  if (!tenantIds.every((tenantId): tenantId is string => !!tenantId)) return false;

  let refusal: string | null = null;
  for (const tenantId of tenantIds) {
    refusal ??= await grantRefusal({ kind: 'user', userId: sub, clientId: source.clientId ?? '', tenantId });
  }
  if (!refusal) return true;
  if (source.grantId) await revokeGrant({ var: { db: baseDb } }, { grantId: source.grantId });
  log.info('OAuth grant refused', { refusal, grantId: source.grantId });
  return false;
}

/**
 * Asked before the provider fetches a client's metadata document: charges the per-IP fetch budget of the request the
 * mounting bound (`server.ts`). A spent budget answers 429 with Retry-After, in the provider's error format on its own
 * routes; a fetch outside a bound request is refused.
 */
async function allowClientMetadataFetch(ctx: KoaContextWithOIDC | undefined): Promise<boolean> {
  try {
    return await chargeLimiter(clientMetadataFetchLimiter);
  } catch (err) {
    // The interaction routes (no provider context) answer the limiter's own error.
    if (!ctx || !(err instanceof AppError) || err.status !== 429) throw err;
    ctx.set('Retry-After', String(err.meta?.retryAfter ?? 1));
    throw new TooManyFetches();
  }
}

/**
 * The authorization server (D12): `node-oidc-provider` fed the app's keystore and store, narrowed to what the scenarios
 * need. Grant types: authorization code + PKCE, refresh, client credentials (service accounts only). Client auth: none
 * (CIMD public clients) and client_secret_basic (registered apps; service accounts with their secret keys). Client
 * registration by Client ID Metadata Document; no dynamic registration, no dev interactions, no logout endpoint.
 */
export async function createProvider(): Promise<Provider> {
  const jwks = await loadSigningJwks();

  const configuration: Configuration = {
    adapter: DrizzleAdapter,
    jwks,
    cookies: { keys: cookieSecrets, long: { signed: true }, short: { signed: true } },
    clientAuthMethods: ['none', 'client_secret_basic'],
    extraClientMetadata: { properties: ['client_kind'] },
    responseTypes: ['code'],
    // Entity scopes plus what a machine client asks for; `openid` stays out: this AS issues no id_tokens.
    scopes: [...accessScopes.all],
    pkce: { required: () => true },
    // Subjects are public, so a sector identifier means nothing here; the provider would fetch one on every use of a
    // client whose metadata document names it, outside the fetch budget.
    sectorIdentifierUriValidate: () => false,
    features: {
      devInteractions: { enabled: false },
      registration: { enabled: false },
      rpInitiatedLogout: { enabled: false },
      userinfo: { enabled: false },
      revocation: { enabled: true },
      clientCredentials: { enabled: true },
      clientIdMetadataDocument: { enabled: true, ack: 'draft-02', allowFetch: allowClientMetadataFetch },
      resourceIndicators: {
        enabled: true,
        // Every token names its resource; a request without one gets `invalid_target` at the guard, never a broad token.
        defaultResource: () => undefined,
        useGrantedResource: () => true,
        getResourceServerInfo: (ctx, resourceIndicator, client) => {
          const resource = parseResource(resourceIndicator);
          if (!resource) throw new InvalidTarget();
          // A service account acts in its own tenant: its token never names another tenant's resource.
          if (isServiceClient(client) && presentedKeys.get(ctx)?.tenantId !== resource.tenantId)
            throw new InvalidTarget();
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
    // Codes and refresh tokens rest on their grant and the grant policy, never on this server's session in the browser
    // that consented: an app sign-out ends that session, and the clients a person connected keep their access.
    expiresWithSession: () => false,
    interactions: {
      policy: appInteractionPolicy(),
      // Same origin as the API: the interaction cookie is scoped to this path, and the page under it reads the session.
      url: (_ctx, interaction) => `/oauth/interaction/${interaction.uid}`,
    },
    findAccount: async (_ctx, sub, token) =>
      (await accountMayUseGrant(sub, token)) ? { accountId: sub, claims: async () => ({ sub }) } : undefined,
    extraTokenClaims: (ctx, token) => {
      const aud = Array.isArray(token.aud) ? token.aud[0] : token.aud;
      const resource = parseResource(aud ?? '');
      // A token without one of this deployment's resources is never minted; the verifier would refuse it anyway.
      if (!resource) throw new InvalidTarget();
      if ('accountId' in token && token.accountId) {
        const claims: IssuedTokenClaims = { actor_kind: 'user', tenant_id: resource.tenantId, gid: token.grantId };
        return claims;
      }
      // Without a consenting person the token acts as a service account, so the client must have presented its API key.
      const key = presentedKeys.get(ctx);
      if (!key) throw new errors.UnauthorizedClient('client_credentials is for service accounts and their API keys');
      const claims: IssuedTokenClaims = { actor_kind: 'service', tenant_id: resource.tenantId, key_id: key.id };
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
        .select({
          id: apiKeysTable.id,
          hash: apiKeysTable.hash,
          expiresAt: apiKeysTable.expiresAt,
          scopes: apiKeysTable.scopes,
          tenantId: serviceAccountsTable.tenantId,
        })
        .from(apiKeysTable)
        .innerJoin(serviceAccountsTable, eq(serviceAccountsTable.id, apiKeysTable.actorId))
        // Read here, not from the cached client: a disabled account stops minting the moment it is disabled.
        .where(
          and(
            eq(apiKeysTable.actorId, this.clientId),
            isNull(apiKeysTable.revokedAt),
            eq(serviceAccountsTable.status, 'active'),
          ),
        );
      const key = keys.find((k) => (!k.expiresAt || !isExpiredDate(k.expiresAt)) && safeEqual(k.hash, presented));
      if (!key) return false;
      const ctx = Provider.ctx;
      if (ctx) presentedKeys.set(ctx, { id: key.id, scopes: key.scopes ?? null, tenantId: key.tenantId });
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

class TooManyFetches extends Error {
  readonly error = 'too_many_requests';
  readonly error_description = 'too many client metadata document fetches from this address';
  readonly status = 429;
  readonly statusCode = 429;
  readonly expose = true;
  constructor() {
    super('too_many_requests');
    this.name = 'TooManyFetches';
  }
}

export type ProviderContext = KoaContextWithOIDC;
