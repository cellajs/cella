import { describe, expect, it, vi } from 'vitest';
import type { AppError } from '#/core/error';
import { resourceMetadataUrl } from '#/modules/oauth-server/resources';
import { tokenGuard } from './token-guard';

// Verification runs against the keystore; a malformed JWT fails before any key is needed.
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

  it('names invalid_token on a JWT it cannot verify', async () => {
    const ctx = mockCtx('Bearer aaa.bbb.ccc');
    expect((await runExpectingError(ctx)).status).toBe(401);
    const [, value] = ctx.header.mock.calls[0];
    expect(value).toContain('error="invalid_token"');
    expect(value).toContain(`resource_metadata="${metadata}"`);
  });
});
