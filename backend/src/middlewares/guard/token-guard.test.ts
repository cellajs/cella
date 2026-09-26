import { importJWK, SignJWT } from 'jose';
import { appConfig } from 'shared';
import { describe, expect, it, vi } from 'vitest';
import type { AppError } from '#/core/error';
import { loadSigningJwks } from '#/modules/oauth-server/keystore';
import { resourceMetadataUrl, resourceUri } from '#/modules/oauth-server/resources';
import { tokenGuard } from './token-guard';

// Verification runs against the keystore. The positive control is tests/mcp.test.ts: its showcases carry tokens the
// authorization server minted for the route's own organization through this guard to the tools.
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

/** A token the server signed for another organization's MCP face: well-formed, wrong audience. */
const tokenForAnotherOrganization = async () => {
  const [signingJwk] = (await loadSigningJwks()).keys;
  return new SignJWT({
    tenant_id: 'tenant1',
    scope: 'attachment:read',
    actor_kind: 'user',
    gid: 'grant1',
    client_id: 'app',
  })
    .setProtectedHeader({ alg: 'RS256', kid: signingJwk.kid, typ: 'at+jwt' })
    .setSubject('user1')
    .setIssuer(appConfig.oauthUrl)
    .setAudience(resourceUri({ face: 'mcp', tenantId: 'tenant1', organizationId: 'org2' }))
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(await importJWK(signingJwk, 'RS256'));
};

describe('tokenGuard', () => {
  it('challenges a tokenless call with the resource metadata URL (RFC 9728)', async () => {
    const ctx = mockCtx();
    const error = await runExpectingError(ctx);
    expect(error.status).toBe(401);
    expect(ctx.header).toHaveBeenCalledWith('WWW-Authenticate', `Bearer resource_metadata="${metadata}"`);
  });

  it('treats an opaque API key as no token: the MCP face takes only access tokens', async () => {
    const ctx = mockCtx('Bearer cella_sk_test_notajwt');
    expect((await runExpectingError(ctx)).status).toBe(401);
    expect(ctx.header).toHaveBeenCalledWith('WWW-Authenticate', `Bearer resource_metadata="${metadata}"`);
  });

  it("names invalid_token on the server's own token for another organization", async () => {
    const ctx = mockCtx(`Bearer ${await tokenForAnotherOrganization()}`);
    expect((await runExpectingError(ctx)).status).toBe(401);
    const [, value] = ctx.header.mock.calls[0];
    // The audience check refuses it: a grant lookup would name its own reason (grant_revoked, ...).
    expect(value).toContain('error="invalid_token", error_description="invalid_token"');
    expect(value).toContain(`resource_metadata="${metadata}"`);
  });
});
