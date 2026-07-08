import { exportJWK, generateKeyPair } from 'jose';
import Provider, { type Configuration, type JWK } from 'oidc-provider';
import { appConfig } from 'shared';
import { env } from '#/env';
import { baseLog } from '#/lib/pino';
import { MCP_SCOPE, MCP_SCOPES, OIDC_ISSUER } from '#/modules/auth-server/oidc-constants';

/**
 * Experimental OAuth 2.1 / OIDC Authorization Server powered by
 * `panva/node-oidc-provider`, mounted in-process at `${backendUrl}/oauth`.
 *
 * Scope of this spike (see .todos/MCP_PLAN.md, Experiment 0):
 * - Issues **audience-bound JWT** access tokens for the MCP resource so the MCP
 *   guard can validate them locally against JWKS (no introspection round-trip).
 * - Supports Authorization Code + PKCE (for interactive MCP clients) and
 *   Client Credentials (for scripted/worker access).
 * - Uses the built-in dev interactions UI and the default **in-memory adapter**.
 *
 * NOT production-ready yet — deliberately deferred to later MCP_PLAN.md phases:
 * Postgres storage adapter, `findAccount` wired to real Cella users, consent
 * policy, tenant/org client binding, and extraction to a dedicated process.
 */

/** Dev confidential client for the client_credentials smoke test. */
const DEV_CLIENT_ID = 'mcp-dev-client';
/** Dev public client for manual Authorization Code + PKCE testing. */
const DEV_PUBLIC_CLIENT_ID = 'mcp-dev-public';

/** Load the signing JWK from env, or generate an ephemeral dev key at boot. */
async function resolveSigningJwk(): Promise<JWK> {
  if (env.OIDC_PRIVATE_JWK) {
    const jwk = JSON.parse(env.OIDC_PRIVATE_JWK) as JWK;
    return { alg: 'RS256', use: 'sig', ...jwk };
  }
  baseLog.warn('OIDC_PRIVATE_JWK not set — generating an ephemeral RS256 key (tokens will not survive a restart)');
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = (await exportJWK(privateKey)) as JWK;
  return { alg: 'RS256', use: 'sig', kid: 'dev-ephemeral', ...jwk };
}

function buildConfiguration(jwk: JWK): Configuration {
  return {
    jwks: { keys: [jwk] },

    // Sign interaction/session cookies with the app cookie secret.
    cookies: { keys: [env.COOKIE_SECRET] },

    // Pre-registered dev clients. DCR (below) covers clients that self-register
    // (e.g. MCP Inspector), so these are only for manual/scripted testing.
    clients: [
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
    ],

    // MCP clients bring their own model and only need `sub`; keep claims minimal.
    scopes: ['openid', ...MCP_SCOPES],
    claims: { openid: ['sub'] },

    pkce: { required: () => true },

    features: {
      // Built-in login/consent UI — dev only, must never ship enabled.
      devInteractions: { enabled: true },
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
      // Dynamic Client Registration (open, dev-only) so MCP Inspector / Claude
      // can self-register instead of needing a pre-shared client_id.
      registration: { enabled: true },
    },

    // Spike stub: accept any subject. TODO: resolve against Cella `usersTable`.
    findAccount: (_ctx, sub) => ({
      accountId: sub,
      claims: () => ({ sub }),
    }),

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
 * only the first request pays key-generation/init cost; the Hono bridge awaits
 * this per request.
 */
export function getOidcProvider(): Promise<Provider> {
  if (!providerPromise) {
    providerPromise = (async () => {
      const jwk = await resolveSigningJwk();
      const provider = new Provider(OIDC_ISSUER, buildConfiguration(jwk));
      // Trust X-Forwarded-* (tunnel/proxy) so absolute URLs use the public host.
      if (appConfig.mode !== 'development') provider.proxy = true;
      baseLog.info(`OIDC Authorization Server ready at ${OIDC_ISSUER}`);
      return provider;
    })();
  }
  return providerPromise;
}
