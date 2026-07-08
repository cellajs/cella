import { eq } from 'drizzle-orm';
import { exportJWK, generateKeyPair } from 'jose';
import Provider, { type Configuration, type JWK } from 'oidc-provider';
import { appConfig } from 'shared';
import { baseDb } from '#/db/db';
import { env } from '#/env';
import { baseLog } from '#/lib/pino';
import { ensureOidcPayloadsTable, PostgresOidcAdapter } from '#/modules/auth-server/oidc-adapter';
import { MCP_SCOPE, MCP_SCOPES, OIDC_ISSUER } from '#/modules/auth-server/oidc-constants';
import { usersTable } from '#/modules/user/user-db';

/**
 * Experimental OAuth 2.1 / OIDC Authorization Server powered by
 * `panva/node-oidc-provider`, mounted in-process at `${backendUrl}/oauth`.
 *
 * - Issues **audience-bound JWT** access tokens for the MCP resource so the MCP
 *   guard can validate them locally against JWKS (no introspection round-trip).
 * - Supports Authorization Code + PKCE (interactive MCP clients) and Client
 *   Credentials (scripted/worker access).
 * - Persists state via the Postgres adapter and resolves logins to real users.
 *
 * Dev-only conveniences (devInteractions, open DCR, pre-registered dev clients,
 * ephemeral keys) are gated to development/tunnel. Still deferred to later
 * MCP_PLAN.md phases: consent policy, per-client tenant binding, and extraction
 * to a dedicated process.
 *
 * @see .todos/MCP_PLAN.md (Experiment 0, Phase 1)
 */

/** Dev/tunnel gets the built-in interactions UI, DCR, and pre-registered clients. */
const isDevLike = appConfig.mode === 'development' || appConfig.mode === 'tunnel';

/** Dev confidential client for the client_credentials smoke test. */
const DEV_CLIENT_ID = 'mcp-dev-client';
/** Dev public client for manual Authorization Code + PKCE testing. */
const DEV_PUBLIC_CLIENT_ID = 'mcp-dev-public';

/**
 * Load the signing JWK from env. Outside dev/tunnel an explicit key is required;
 * an ephemeral key there would invalidate every issued token on each restart.
 */
async function resolveSigningJwk(): Promise<JWK> {
  if (env.OIDC_PRIVATE_JWK) {
    const jwk = JSON.parse(env.OIDC_PRIVATE_JWK) as JWK;
    return { alg: 'RS256', use: 'sig', ...jwk };
  }
  if (!isDevLike) {
    throw new Error(
      'OIDC_PRIVATE_JWK is required outside development — set a stable RS256 JWK so tokens survive restarts.',
    );
  }
  baseLog.warn('OIDC_PRIVATE_JWK not set — generating an ephemeral RS256 key (tokens will not survive a restart)');
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = (await exportJWK(privateKey)) as JWK;
  return { alg: 'RS256', use: 'sig', kid: 'dev-ephemeral', ...jwk };
}

/** Pre-registered dev/tunnel clients (DCR covers self-registering clients in dev). */
const devClients: Configuration['clients'] = [
  {
    client_id: DEV_CLIENT_ID,
    client_secret: env.OIDC_DEV_CLIENT_SECRET,
    grant_types: ['client_credentials'],
    response_types: [],
    redirect_uris: [],
    scope: MCP_SCOPE,
    token_endpoint_auth_method: 'client_secret_basic',
  },
  {
    client_id: DEV_PUBLIC_CLIENT_ID,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    redirect_uris: ['http://localhost:6274/oauth/callback', 'http://localhost:3000/mcp/callback'],
    scope: `openid ${MCP_SCOPE}`,
    token_endpoint_auth_method: 'none',
    application_type: 'native',
  },
];

/** Resolve an OIDC subject to a real Cella user (login fails for unknown subjects). */
async function findCellaAccount(sub: string) {
  const [user] = await baseDb
    .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, sub))
    .limit(1)
    .catch(() => []);
  if (!user) return undefined;
  return {
    accountId: user.id,
    claims: async () => ({ sub: user.id, email: user.email, name: user.name }),
  };
}

function buildConfiguration(jwk: JWK): Configuration {
  return {
    jwks: { keys: [jwk] },

    // Persist all OIDC state in Postgres (survives restarts, shareable).
    adapter: PostgresOidcAdapter,

    // Sign interaction/session cookies with the app cookie secret.
    cookies: { keys: [env.COOKIE_SECRET] },

    clients: isDevLike ? devClients : [],

    // MCP clients bring their own model and only need `sub`; keep claims minimal.
    scopes: ['openid', ...MCP_SCOPES],
    claims: { openid: ['sub'], email: ['email'], profile: ['name'] },

    pkce: { required: () => true },

    features: {
      // Built-in login/consent UI — dev/tunnel only, never in production.
      devInteractions: { enabled: isDevLike },
      // RFC 8707: bind tokens to the MCP resource and issue them as JWTs so the
      // resource server can verify locally.
      resourceIndicators: {
        enabled: true,
        useGrantedResource: () => true,
        getResourceServerInfo: (_ctx, resourceIndicator) => ({
          scope: MCP_SCOPE,
          audience: resourceIndicator,
          accessTokenFormat: 'jwt',
          accessTokenTTL: 60 * 60,
          jwt: { sign: { alg: 'RS256' } },
        }),
      },
      clientCredentials: { enabled: true },
      introspection: { enabled: true },
      revocation: { enabled: true },
      // Dynamic Client Registration — open, so gated to dev/tunnel. Production
      // expects pre-registered clients (persistent client management is future work).
      registration: { enabled: isDevLike },
    },

    findAccount: (_ctx, sub) => findCellaAccount(sub),

    ttl: {
      AccessToken: 60 * 60,
      ClientCredentials: 60 * 60,
      AuthorizationCode: 60,
      IdToken: 60 * 60,
    },
  };
}

let providerPromise: Promise<Provider> | undefined;

/**
 * Lazily construct (once) and return the OIDC Provider. Cached as a promise so
 * only the first request pays init cost; the Hono bridge awaits this per request.
 */
export function getOidcProvider(): Promise<Provider> {
  if (!providerPromise) {
    providerPromise = (async () => {
      await ensureOidcPayloadsTable();
      const jwk = await resolveSigningJwk();
      const provider = new Provider(OIDC_ISSUER, buildConfiguration(jwk));
      // Trust X-Forwarded-* (tunnel/proxy) so absolute URLs use the public host.
      if (!isDevLike) provider.proxy = true;
      baseLog.info(`OIDC Authorization Server ready at ${OIDC_ISSUER}`);
      return provider;
    })();
  }
  return providerPromise;
}
