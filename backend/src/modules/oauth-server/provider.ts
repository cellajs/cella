import { eq } from 'drizzle-orm';
import Provider, { type Configuration, errors, type KoaContextWithOIDC } from 'oidc-provider';
import { type AccessScope, accessScopes, appConfig } from 'shared';
import { safeEqual } from 'shared/utils/safe-equal';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { chargeLimiter } from '#/middlewares/rate-limiter/helpers';
import { clientMetadataFetchLimiter } from '#/middlewares/rate-limiter/limiters';
import { amrOf, authStrategiesEnum, cookieSecrets, stepUpProofs } from '#/modules/auth/core';
import { appClientProperties, clientKindOf, DrizzleAdapter, ltiInstallationOf } from '#/modules/oauth-server/adapter';
import { grantRefusal } from '#/modules/oauth-server/grant-policy';
import { appInteractionPolicy } from '#/modules/oauth-server/interaction-policy';
import { loadSigningJwks } from '#/modules/oauth-server/keystore';
import { findGrantSignIn } from '#/modules/oauth-server/oauth-server-queries';
import { parseResource, resourceUri } from '#/modules/oauth-server/resources';
import { revokeGrant } from '#/modules/oauth-server/revoke-grant';
import { apiKeyRefusal } from '#/modules/service-accounts/helpers/api-key';
import { findApiKeyWithAccount } from '#/modules/service-accounts/service-accounts-queries';
import { usersTable } from '#/modules/user/user-db';
import { hashToken } from '#/utils/hash-token';
import { log } from '#/utils/logger';

const hour = 60 * 60;
const day = 24 * hour;

/** The longest a client assertion may still be good for when presented: a leaked one is redeemable once until then. */
const maxAssertionLifetime = 5 * 60;

/** The provider routes that start an authorization request: the authorization endpoint and pushed requests. */
const authorizationRoutes = new Set(['authorization', 'pushed_authorization_request']);

/**
 * The secret key a service account presented at the token endpoint, per request (null scopes: an unscoped key), with the
 * account's tenant. Client authentication records it; the resource lookup that follows keeps the token in that tenant
 * and caps it at the key's scopes, and the token names the key.
 */
const presentedKeys = new WeakMap<object, { id: string; scopes: readonly AccessScope[] | null; tenantId: string }>();

/**
 * The scopes a token may carry. A key narrows its service account and never widens it, so a service account's token
 * stays within the key it authenticated with (`write` covers `read`, as on the API); an installed LTI tool's stays
 * within what an admin granted; other clients may ask for every offered one.
 */
function grantableScopes(ctx: object, client: object): readonly AccessScope[] {
  const kind = clientKindOf(client);
  if (kind === 'lti') return ltiInstallationOf(client)?.granted_scopes ?? [];
  if (kind !== 'service') return accessScopes.offered;
  const key = presentedKeys.get(ctx);
  // No recorded key means client authentication did not run for this request: grant nothing.
  if (!key) return [];
  const held = key.scopes;
  return accessScopes.offered.filter((scope) => !held || accessScopes.covers(held, scope));
}

/**
 * Refuses an installed LTI tool's token request beyond what it may get: a resource other than its own tenant's API, or
 * a scope an admin did not grant, unknown ones included. Other clients' unknown scopes are dropped as the provider does.
 */
function assertLtiTokenRequest(ctx: KoaContextWithOIDC, client: object, resource: { face: string; tenantId: string }) {
  const installation = ltiInstallationOf(client);
  if (!installation) return;
  if (resource.face !== 'api' || resource.tenantId !== installation.tenant_id) throw new errors.InvalidTarget();
  const granted = new Set<string>(installation.granted_scopes);
  const refused = String(ctx.oidc.params?.scope ?? '')
    .split(' ')
    .find((scope) => scope && !granted.has(scope));
  if (refused) throw new errors.InvalidScope('requested scope is not granted', refused);
}

/**
 * Claims this server adds to every access token; the guard reads them to build the actor, and reads what the token
 * rests on: the grant (`gid`) through the grant policy, the API key (`key_id`) or the LTI installation
 * (`installation_id`). A person's token also says how they signed in, in the app's words (`auth_strategy`,
 * `connection_id`, which a tenant's sign-in policy reads) and in the standard ones (`amr` per RFC 8176, `auth_time` as
 * the moment the proof the consent rested on was made).
 */
export type IssuedTokenClaims =
  | {
      actor_kind: 'user';
      tenant_id: string;
      gid: string;
      auth_strategy: string | null;
      connection_id: string | null;
      amr: string[];
      auth_time?: number;
    }
  | { actor_kind: 'service'; tenant_id: string; key_id: string }
  | { actor_kind: 'service'; tenant_id: string; installation_id: string };

/** The `amr` values of a grant's stamped sign-in; empty for a method or proof this app no longer knows. */
const amrOfStamp = (authStrategy: string | null, proof: string | null) => {
  const strategy = authStrategiesEnum.find((known) => known === authStrategy);
  const stamp = stepUpProofs.find((known) => known === proof) ?? null;
  return strategy ? amrOf(strategy, stamp) : [];
};

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
  const tenantIds = [source.resource].flat().map((uri) => (typeof uri === 'string' ? parseResource(uri)?.tenantId : null));
  if (!tenantIds.every((tenantId): tenantId is string => !!tenantId)) return false;

  let refusal: string | null = null;
  for (const tenantId of tenantIds) {
    refusal ??= await grantRefusal({ userId: sub, clientId: source.clientId ?? '', tenantId });
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
 * Asked about every client resolved from a metadata document, fetched or cached. A client's kind and installation are
 * what the adapter read: a document that claims either is refused as a document, with the provider's own error.
 */
function allowClient(_ctx: KoaContextWithOIDC, client: object): boolean {
  const claimed = appClientProperties.find((property) => property in client);
  if (claimed) throw new errors.InvalidClientMetadata(`client_id metadata document must not set ${claimed}`);
  // A client that signs its own assertions would make the provider fetch the key set its document names, outside the
  // guarded fetch: a document client authenticates with nothing.
  if ('tokenEndpointAuthMethod' in client && client.tokenEndpointAuthMethod !== 'none') {
    throw new errors.InvalidClientMetadata('client_id metadata document must use token_endpoint_auth_method none');
  }
  return true;
}

/**
 * The authorization server: `node-oidc-provider` fed the app's keystore and store. Grant types: authorization code +
 * PKCE, refresh, client credentials (service accounts and installed LTI tools only). Client auth: none (CIMD public
 * clients), client_secret_basic (registered apps; service accounts with their secret keys) and private_key_jwt (an
 * installed LTI tool with a key of the set it registered). Client registration by Client ID Metadata Document; no
 * dynamic registration, no dev interactions, no logout endpoint.
 */
export async function createProvider(): Promise<Provider> {
  const jwks = await loadSigningJwks();

  const configuration: Configuration = {
    adapter: DrizzleAdapter,
    jwks,
    cookies: { keys: cookieSecrets, long: { signed: true }, short: { signed: true } },
    clientAuthMethods: ['none', 'client_secret_basic', 'private_key_jwt'],
    // The one algorithm an LTI tool signs with (LTI Security Framework 1.0, section 6.1).
    enabledJWA: { clientAuthSigningAlgValues: ['RS256'] },
    // Keeps the adapter's own metadata on its clients; `allowClient` refuses a metadata document that sets any.
    extraClientMetadata: { properties: [...appClientProperties] },
    responseTypes: ['code'],
    // The offered entity scopes only; `openid` stays out: this server issues no ID tokens. An installed LTI tool's token
    // carries `user:read` through its resource's scopes (`getResourceServerInfo`), which discovery leaves unlisted.
    scopes: [...accessScopes.offered],
    // An assertion's own `exp` would let a leaked one wait for its single use until then.
    assertJwtClientAuthClaimsAndHeader: (_ctx, claims) => {
      if (typeof claims.exp === 'number' && claims.exp - Date.now() / 1000 > maxAssertionLifetime) {
        throw new errors.InvalidClientAuth('client assertion must expire within five minutes');
      }
    },
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
      // The guards verify no DPoP proof, so nothing advertises one or binds a token to a key.
      dPoP: { enabled: false },
      clientCredentials: { enabled: true },
      clientIdMetadataDocument: { enabled: true, ack: 'draft-02', allowFetch: allowClientMetadataFetch, allowClient },
      resourceIndicators: {
        enabled: true,
        // Every token names its resource. An authorization request without one is answered `invalid_target` on the
        // client's redirect URI (RFC 8707 §2.1); at the token endpoint the grant's resource applies (`useGrantedResource`).
        defaultResource: (ctx, _client, oneOf) => {
          if (!oneOf && authorizationRoutes.has(ctx.oidc.route)) throw new errors.InvalidTarget('resource indicator is required');
          return undefined;
        },
        useGrantedResource: () => true,
        getResourceServerInfo: (ctx, resourceIndicator, client) => {
          const resource = parseResource(resourceIndicator);
          if (!resource) throw new errors.InvalidTarget();
          // A service account acts in its own tenant: its token never names another tenant's resource.
          if (clientKindOf(client) === 'service' && presentedKeys.get(ctx)?.tenantId !== resource.tenantId) throw new errors.InvalidTarget();
          assertLtiTokenRequest(ctx, client, resource);
          const scope = grantableScopes(ctx, client).join(' ');
          // The audience is the resource as the guards spell it, whatever case its origin and tenant id were sent in.
          return { scope, audience: resourceUri(resource), accessTokenFormat: 'jwt', accessTokenTTL: hour };
        },
      },
    },
    ttl: {
      AccessToken: hour,
      AuthorizationCode: 10 * 60,
      ClientCredentials: hour,
      Grant: 30 * day,
      Interaction: 10 * 60,
      RefreshToken: 30 * day,
      Session: day,
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
    findAccount: async (_ctx, sub, token) => ((await accountMayUseGrant(sub, token)) ? { accountId: sub, claims: async () => ({ sub }) } : undefined),
    extraTokenClaims: async (ctx, token) => {
      const aud = Array.isArray(token.aud) ? token.aud[0] : token.aud;
      const resource = parseResource(aud ?? '');
      // A token without one of this deployment's resources is never minted; the verifier would refuse it anyway.
      if (!resource) throw new errors.InvalidTarget();
      if ('accountId' in token && token.accountId) {
        // The method and connection of the session that consented: a tenant's sign-in policy reads them.
        const signIn = await findGrantSignIn({ var: { db: baseDb } }, { grantId: token.grantId });
        return {
          actor_kind: 'user',
          tenant_id: resource.tenantId,
          gid: token.grantId,
          auth_strategy: signIn.authStrategy,
          connection_id: signIn.connectionId,
          amr: amrOfStamp(signIn.authStrategy, signIn.proof),
          ...(signIn.authTime && { auth_time: Math.floor(Date.parse(signIn.authTime) / 1000) }),
        } satisfies IssuedTokenClaims;
      }
      // An installed LTI tool acts as its installation, which `getResourceServerInfo` kept to its own tenant.
      const installation = ltiInstallationOf(ctx.oidc.client ?? {});
      if (installation) return { actor_kind: 'service', tenant_id: resource.tenantId, installation_id: installation.id } satisfies IssuedTokenClaims;
      // Without a consenting person the token acts as a service account, so the client must have presented its API key.
      const key = presentedKeys.get(ctx);
      if (!key) throw new errors.UnauthorizedClient('client_credentials is for service accounts and their API keys');
      return { actor_kind: 'service', tenant_id: resource.tenantId, key_id: key.id } satisfies IssuedTokenClaims;
    },
    renderError: async (ctx, out, error) => {
      // A client's own mistake (bad PKCE, expired code, refusal) is request noise; only the server's faults are warnings.
      const level = ctx.status >= 500 ? 'warn' : 'info';
      log[level]('OAuth server error', { error: out.error, description: out.error_description, ...(level === 'warn' && { err: error }) });
      ctx.type = 'json';
      ctx.body = out;
    },
  };

  const provider = new Provider(appConfig.oauthUrl, configuration);
  provider.proxy = true;

  // Secrets are never stored in plaintext: a registered app's secret is compared by hash, a service account's client
  // secret is any of its live secret keys, whose scopes then cap the token (`grantableScopes`).
  provider.Client.prototype.compareClientSecret = async function compare(this: { clientId: string; clientSecret?: string }, actual: string) {
    const presented = hashToken(actual);
    if (clientKindOf(this) === 'service') {
      // Read here, not from the cached client: a disabled account stops minting the moment it is disabled.
      const found = await findApiKeyWithAccount({ var: { db: baseDb } }, { key: { hash: presented }, actorId: this.clientId });
      if (!found || apiKeyRefusal(found.apiKey, found.account)) return false;
      const { apiKey, account } = found;
      const ctx = Provider.ctx;
      if (ctx) presentedKeys.set(ctx, { id: apiKey.id, scopes: apiKey.scopes ?? null, tenantId: account.tenantId });
      return true;
    }
    return typeof this.clientSecret === 'string' && safeEqual(this.clientSecret, presented);
  };

  return provider;
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
