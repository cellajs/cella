import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppError } from '#/core/error';
import { clearTenantCache, setTenantCache } from './tenant-cache';
import { tenantGuard } from './tenant-guard';

// The tenant row is served from the cache; a miss would reach the prepared lookup, which these cases never do.
const TENANT_ID = 'tenant1';
const OTHER_TENANT_ID = 'tenant2';

const tenantRow = (status = 'active') => ({ id: TENANT_ID, status, createdBy: 'founder', restrictions: {} }) as never;

const membership = (tenantId: string) =>
  ({
    tenantId,
    channelType: 'organization',
    channelId: 'org-1',
    organizationId: 'org-1',
    role: 'member',
    userId: 'u1',
  }) as never;

type Actor = { kind: 'user' | 'service'; id: string; bindings: unknown[]; scopes: null; tenantId?: string };

const mockCtx = (opts: { actor?: Actor; isSystemAdmin?: boolean; tenantId?: string | undefined }) => ({
  req: { param: (name: string) => (name === 'tenantId' ? opts.tenantId : undefined) },
  var: { actor: opts.actor, isSystemAdmin: opts.isSystemAdmin ?? false },
  set: vi.fn(),
});

const run = async (ctx: ReturnType<typeof mockCtx>) => {
  const next = vi.fn();
  await tenantGuard(ctx as never, next);
  return next;
};

const runExpectingError = async (ctx: ReturnType<typeof mockCtx>) => {
  try {
    await run(ctx);
  } catch (error) {
    return error as AppError;
  }
  throw new Error('expected tenantGuard to throw');
};

const user = (bindings: unknown[]): Actor => ({ kind: 'user', id: 'u1', bindings, scopes: null });
const service = (tenantId: string, bindings: unknown[] = [membership(tenantId)]): Actor => ({
  kind: 'service',
  id: 'sa1',
  tenantId,
  bindings,
  scopes: null,
});

describe('tenantGuard', () => {
  beforeEach(() => {
    clearTenantCache();
    setTenantCache(TENANT_ID, tenantRow());
  });

  it('admits a member of the tenant and sets tenant context', async () => {
    const ctx = mockCtx({ actor: user([membership(TENANT_ID)]), tenantId: 'TENANT1' });
    const next = await run(ctx);
    expect(next).toHaveBeenCalled();
    expect(ctx.set).toHaveBeenCalledWith('tenantId', TENANT_ID);
  });

  it('refuses a user with no foothold in the tenant', async () => {
    const error = await runExpectingError(mockCtx({ actor: user([membership(OTHER_TENANT_ID)]), tenantId: TENANT_ID }));
    expect(error.status).toBe(403);
  });

  it('admits a system admin and the tenant creator without a membership', async () => {
    expect(await run(mockCtx({ actor: user([]), isSystemAdmin: true, tenantId: TENANT_ID }))).toHaveBeenCalled();
    const creator: Actor = { kind: 'user', id: 'founder', bindings: [], scopes: null };
    expect(await run(mockCtx({ actor: creator, tenantId: TENANT_ID }))).toHaveBeenCalled();
  });

  it('refuses a service account whose key belongs to another tenant, before any lookup', async () => {
    // No cache entry for the URL tenant: a lookup would have to hit the database.
    const error = await runExpectingError(mockCtx({ actor: service(TENANT_ID), tenantId: OTHER_TENANT_ID }));
    expect(error.status).toBe(403);
  });

  it('admits a service account in its own tenant only when it holds a grant there', async () => {
    expect(await run(mockCtx({ actor: service(TENANT_ID), tenantId: TENANT_ID }))).toHaveBeenCalled();
    const error = await runExpectingError(mockCtx({ actor: service(TENANT_ID, []), tenantId: TENANT_ID }));
    expect(error.status).toBe(403);
  });

  it('refuses an inactive tenant and a missing tenant id', async () => {
    setTenantCache(TENANT_ID, tenantRow('suspended'));
    expect(
      (await runExpectingError(mockCtx({ actor: user([membership(TENANT_ID)]), tenantId: TENANT_ID }))).status,
    ).toBe(403);
    expect((await runExpectingError(mockCtx({ actor: user([]), tenantId: undefined }))).status).toBe(400);
  });

  it('requires an actor', async () => {
    expect((await runExpectingError(mockCtx({ tenantId: TENANT_ID }))).status).toBe(401);
  });
});
