import { generateKeyPair, importJWK, SignJWT } from 'jose';
import { appConfig } from 'shared';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppError } from '#/core/error';
import { ensureSigningKeys, loadSigningJwks } from '#/modules/oauth-server/keystore';
import { mcpInitialScope, resourceMetadataUrl, resourceUri } from '#/modules/oauth-server/resources';
import { tokenGuard } from './token-guard';

// Verification runs against the keystore. The end-to-end positive control is tests/mcp.test.ts: its showcases carry
// tokens the authorization server minted for the route's own organization through this guard to the tools.
const mockCtx = (authorization?: string) => ({
  req: {
    param: (name: string) => ({ tenantId: 'tenant1', organizationId: 'org1' })[name],
    header: (name: string) => (name === 'authorization' ? authorization : undefined),
  },
  var: {},
  set: vi.fn(),
  header: vi.fn(),
});

const runExpectingError = async (ctx: ReturnType<typeof mockCtx>) => {
  try {
    await tokenGuard(ctx as never, vi.fn());
  } catch (error) {
    return error as AppError;
  }
  throw new Error('expected tokenGuard to throw');
};

const metadata = resourceMetadataUrl({ face: 'mcp', tenantId: 'tenant1', organizationId: 'org1' });
const resource = resourceUri({ face: 'mcp', tenantId: 'tenant1', organizationId: 'org1' });

/** The claims of a person's token for this route's organization; a forgery changes one thing about it. */
const claims = { tenant_id: 'tenant1', scope: 'attachment:read', actor_kind: 'user', gid: 'grant1', client_id: 'app' };

interface Forgery {
  /** The signing key; the server's current key unless given. */
  key?: CryptoKey | Uint8Array;
  alg?: string;
  issuer?: string;
  audience?: string;
  expiresAt?: number | string;
}

/** A token signed under the server's `kid`, well-formed for this route unless a forgery says otherwise. */
const signed = async ({ key, alg = 'RS256', issuer = appConfig.oauthUrl, audience = resource, expiresAt = '1h' }: Forgery = {}) => {
  const [signingJwk] = (await loadSigningJwks()).keys;
  return new SignJWT(claims)
    .setProtectedHeader({ alg, kid: signingJwk.kid, typ: 'at+jwt' })
    .setSubject('user1')
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key ?? (await importJWK(signingJwk, 'RS256')));
};

/** The same claims under the server's `kid` with `alg: none` and no signature, built by hand: `SignJWT` refuses to. */
const unsigned = async () => {
  const [signingJwk] = (await loadSigningJwks()).keys;
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = { ...claims, sub: 'user1', iss: appConfig.oauthUrl, aud: resource, iat: now, exp: now + 3600 };
  return `${part({ alg: 'none', kid: signingJwk.kid, typ: 'at+jwt' })}.${part(payload)}.`;
};

/** The server's public key as the JWKS endpoint publishes it, as bytes: an HMAC secret anyone can read. */
const publicKeyBytes = async () => {
  const [{ kty, n, e, kid }] = (await loadSigningJwks()).keys;
  return new TextEncoder().encode(JSON.stringify({ kty, n, e, alg: 'RS256', use: 'sig', kid }));
};

describe('tokenGuard', () => {
  // A fresh test database holds no signing key until the authorization server boots or this mints one.
  beforeAll(() => ensureSigningKeys());

  it('must name only read scopes in the challenge, so a client starts minimal (RFC 9728)', async () => {
    const ctx = mockCtx();
    const error = await runExpectingError(ctx);
    expect(error.status).toBe(401);
    expect(mcpInitialScope).not.toMatch(/:write|:delete/);
    expect(ctx.header).toHaveBeenCalledWith('WWW-Authenticate', `Bearer resource_metadata="${metadata}", scope="${mcpInitialScope}"`);
  });

  it('treats an opaque API key as no token: the MCP face takes only access tokens', async () => {
    const ctx = mockCtx('Bearer cella_sk_test_notajwt');
    expect((await runExpectingError(ctx)).status).toBe(401);
    expect(ctx.header).toHaveBeenCalledWith('WWW-Authenticate', `Bearer resource_metadata="${metadata}", scope="${mcpInitialScope}"`);
  });

  /**
   * The verifier pins the signature to the server's keys, and the token to this issuer, this route's resource and its
   * expiry. A token that fails any of these never reaches the grant policy or the database: the challenge names the
   * verifier's reason, and no actor is set.
   */
  const forgeries: [vector: string, forge: () => Promise<string>, reason: string][] = [
    ['a token from another issuer', () => signed({ issuer: 'https://evil.example/oauth' }), 'invalid_token'],
    ['an expired token', () => signed({ expiresAt: Math.floor(Date.now() / 1000) - 3600 }), 'token_expired'],
    [
      "the server's own token for another organization",
      () => signed({ audience: resourceUri({ face: 'mcp', tenantId: 'tenant1', organizationId: 'org2' }) }),
      'invalid_token',
    ],
    ['an unsigned token (`alg: none`)', unsigned, 'invalid_token'],
    ["an HS256 token keyed with the server's public key", async () => signed({ alg: 'HS256', key: await publicKeyBytes() }), 'invalid_token'],
    ["an attacker's key under the server's `kid`", async () => signed({ key: (await generateKeyPair('RS256')).privateKey }), 'invalid_token'],
  ];

  it.each(forgeries)('must not set an actor via %s', async (_vector, forge, reason) => {
    const ctx = mockCtx(`Bearer ${await forge()}`);
    expect((await runExpectingError(ctx)).status).toBe(401);
    expect(ctx.set).not.toHaveBeenCalled();
    expect(ctx.header).toHaveBeenCalledWith(
      'WWW-Authenticate',
      `Bearer error="invalid_token", error_description="${reason}", resource_metadata="${metadata}", scope="${mcpInitialScope}"`,
    );
  });

  it("passes the server's own token for this organization on to the grant policy (positive control)", async () => {
    const ctx = mockCtx(`Bearer ${await signed()}`);
    expect((await runExpectingError(ctx)).status).toBe(401);
    // The verifier accepted it: the refusal is the policy's, about the grant the token names.
    expect(ctx.header).toHaveBeenCalledWith(
      'WWW-Authenticate',
      `Bearer error="invalid_token", error_description="grant_revoked", resource_metadata="${metadata}", scope="${mcpInitialScope}"`,
    );
  });
});
