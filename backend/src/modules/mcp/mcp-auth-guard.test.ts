import { Hono } from 'hono';
import { type CryptoKey, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '#/core/context';
import { mcpResourceUri, OIDC_ISSUER } from '#/modules/auth-server/oidc-constants';
import { mcpAuthGuard, setMcpJwksResolver } from '#/modules/mcp/mcp-auth-guard';

/**
 * Unit tests for the MCP resource-server guard. Signing keys are generated in
 * the test and injected via `setMcpJwksResolver(createLocalJWKSet(...))`, so no
 * running Authorization Server is needed.
 *
 * These cover every path up to (and including) subject resolution against the
 * DB. The full happy path (known user → `tools/call whoami`) is exercised at
 * runtime — see .todos/MCP_PLAN.md (Experiment 0) verification.
 */

const TENANT = 'tenant-test';
const ORG = 'org-test';
const AUDIENCE = mcpResourceUri(TENANT, ORG);
const FULL_SCOPE = 'mcp:tools:read mcp:tools:call';

let privateKey: CryptoKey;

async function mint(opts: { sub?: string; aud?: string; scope?: string; iss?: string } = {}): Promise<string> {
  return new SignJWT({ scope: opts.scope ?? FULL_SCOPE })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(opts.iss ?? OIDC_ISSUER)
    .setAudience(opts.aud ?? AUDIENCE)
    .setSubject(opts.sub ?? '00000000-0000-0000-0000-000000000000')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

// Minimal app mirroring the MCP route's guard + param shape.
const app = new Hono<Env>();
app.post('/:tenantId/:organizationId/mcp', mcpAuthGuard, (c) => c.json({ ok: true, userId: c.var.userId }));

const call = (headers?: Record<string, string>) => app.request(`/${TENANT}/${ORG}/mcp`, { method: 'POST', headers });

beforeAll(async () => {
  const { privateKey: priv, publicKey } = await generateKeyPair('RS256', { extractable: true });
  privateKey = priv;
  const publicJwk = { ...((await exportJWK(publicKey)) as JWK), kid: 'test', alg: 'RS256', use: 'sig' };
  setMcpJwksResolver(createLocalJWKSet({ keys: [publicJwk] }));
});

describe('mcpAuthGuard', () => {
  it('challenges with 401 + WWW-Authenticate when no bearer token is present', async () => {
    const res = await call();
    expect(res.status).toBe(401);
    const challenge = res.headers.get('www-authenticate') ?? '';
    expect(challenge).toContain('Bearer');
    expect(challenge).toContain('resource_metadata=');
  });

  it('rejects a malformed / unverifiable token with 401 invalid_token', async () => {
    const res = await call({ Authorization: 'Bearer not-a-real-jwt' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate') ?? '').toContain('error="invalid_token"');
  });

  it('rejects a token minted for the wrong audience', async () => {
    const token = await mint({ aud: 'https://api.cellajs.com/other/org/mcp' });
    const res = await call({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
  });

  it('rejects a token issued by the wrong issuer', async () => {
    const token = await mint({ iss: 'https://evil.example.com' });
    const res = await call({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
  });

  it('returns 403 insufficient_scope when the mcp:tools:read scope is missing', async () => {
    const token = await mint({ scope: 'openid' });
    const res = await call({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(403);
    expect(res.headers.get('www-authenticate') ?? '').toContain('insufficient_scope');
  });

  it('accepts a valid token but rejects an unknown subject (no matching Cella user)', async () => {
    const token = await mint({ sub: '11111111-1111-1111-1111-111111111111' });
    const res = await call({ Authorization: `Bearer ${token}` });
    // Signature/issuer/audience/scope all pass; the subject just isn't a user.
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate') ?? '').toContain('error="invalid_token"');
  });

  it('fails closed (401, not 500) when the subject is not a valid user id', async () => {
    // A service-client sub (e.g. client_credentials client_id) is not a UUID;
    // the user lookup must not surface a Postgres cast error as a 500.
    const token = await mint({ sub: 'mcp-dev-client' });
    const res = await call({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
  });
});
