import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppError } from '#/core/error';
import { findUserSsoConnection } from '#/modules/connections/connections-queries';
import { countOrganizationsByTenant } from '#/modules/organization/organization-queries';
import { clearTenantCache, setTenantCache } from './tenant-cache';
import { tenantGuard } from './tenant-guard';

// The creator's foothold depends on whether the tenant holds an organization yet.
vi.mock('#/modules/organization/organization-queries', () => ({ countOrganizationsByTenant: vi.fn() }));
// The sign-in policy binds a user who holds an identity through the tenant's connection.
vi.mock('#/modules/connections/connections-queries', () => ({ findUserSsoConnection: vi.fn() }));

// The tenant row is served from the cache; a miss would reach the prepared lookup, which these cases never do.
const testTenantId = 'tenant1';
const otherTenantId = 'tenant2';

const tenantRow = (status = 'active', authStrategies: string[] = []) =>
  ({ id: testTenantId, status, createdBy: 'founder', restrictions: {}, authStrategies }) as never;

const membership = (tenantId: string) =>
  ({ tenantId, channelType: 'organization', channelId: 'org-1', organizationId: 'org-1', role: 'member', userId: 'u1' }) as never;

type Actor = {
  kind: 'user' | 'service';
  id: string;
  bindings: unknown[];
  scopes: null;
  tenantId?: string;
  authStrategy?: string | null;
  connectionId?: string;
};

const mockCtx = (opts: { actor?: Actor; isSystemAdmin?: boolean; impersonator?: { id: string } | null; tenantId?: string | undefined }) => ({
  req: { param: (name: string) => (name === 'tenantId' ? opts.tenantId : undefined) },
  var: { actor: opts.actor, isSystemAdmin: opts.isSystemAdmin ?? false, impersonator: opts.impersonator ?? null },
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
    setTenantCache(testTenantId, tenantRow());
    vi.mocked(countOrganizationsByTenant).mockReset().mockResolvedValue(0);
    vi.mocked(findUserSsoConnection)
      .mockReset()
      .mockResolvedValue(undefined as never);
  });

  describe('sign-in policy (tenants.authStrategies)', () => {
    const bound = { id: 'conn-1' };
    const member = (authStrategy: string | null, connectionId?: string): Actor => ({
      ...user([membership(testTenantId)]),
      authStrategy,
      connectionId,
    });

    it('refuses a member who holds an identity through the connection but signed in another way, naming the entry', async () => {
      setTenantCache(testTenantId, tenantRow('active', ['surfconext']));
      vi.mocked(findUserSsoConnection).mockResolvedValue(bound);

      const error = await runExpectingError(mockCtx({ actor: member('magic'), tenantId: testTenantId }));
      expect(error.status).toBe(403);
      expect(error.type).toBe('sso_required');
      expect(error.meta).toMatchObject({ connectionId: 'conn-1', entryPath: '/auth/sso/conn-1' });

      // A token minted before the claim existed carries no method: refused the same way.
      expect((await runExpectingError(mockCtx({ actor: member(null), tenantId: testTenantId }))).type).toBe('sso_required');
    });

    it('admits an allowed method without a lookup, a federation sign-in through the connection, an external without an identity, a system admin as themselves or as a user, and every tenant without a policy', async () => {
      setTenantCache(testTenantId, tenantRow('active', ['surfconext', 'passkey']));
      expect(await run(mockCtx({ actor: member('passkey'), tenantId: testTenantId }))).toHaveBeenCalled();
      expect(findUserSsoConnection).not.toHaveBeenCalled();

      vi.mocked(findUserSsoConnection).mockResolvedValue(bound);
      expect(await run(mockCtx({ actor: member('surfconext', 'conn-1'), tenantId: testTenantId }))).toHaveBeenCalled();

      vi.mocked(findUserSsoConnection).mockResolvedValue(undefined as never);
      expect(await run(mockCtx({ actor: member('magic'), tenantId: testTenantId }))).toHaveBeenCalled();
      expect(findUserSsoConnection).toHaveBeenCalledWith(expect.anything(), { userId: 'u1', tenantId: testTenantId });

      vi.mocked(findUserSsoConnection).mockResolvedValue(bound);
      expect(await run(mockCtx({ actor: member('magic'), isSystemAdmin: true, tenantId: testTenantId }))).toHaveBeenCalled();
      // An impersonation: the method is its admin's, who proved nothing as the bound member.
      expect(await run(mockCtx({ actor: member('magic'), impersonator: { id: 'admin' }, tenantId: testTenantId }))).toHaveBeenCalled();
      expect(await run(mockCtx({ actor: service(testTenantId), tenantId: testTenantId }))).toHaveBeenCalled();

      setTenantCache(testTenantId, tenantRow('active', []));
      expect(await run(mockCtx({ actor: member('magic'), tenantId: testTenantId }))).toHaveBeenCalled();
    });
  });

  it('admits a member of the tenant and sets tenant context', async () => {
    const ctx = mockCtx({ actor: user([membership(testTenantId)]), tenantId: 'TENANT1' });
    const next = await run(ctx);
    expect(next).toHaveBeenCalled();
    expect(ctx.set).toHaveBeenCalledWith('tenantId', testTenantId);
  });

  it('refuses a user with no foothold in the tenant', async () => {
    const error = await runExpectingError(mockCtx({ actor: user([membership(otherTenantId)]), tenantId: testTenantId }));
    expect(error.status).toBe(403);
  });

  it('admits a system admin, and the tenant creator without a membership while the tenant has no organization', async () => {
    expect(await run(mockCtx({ actor: user([]), isSystemAdmin: true, tenantId: testTenantId }))).toHaveBeenCalled();
    const creator: Actor = { kind: 'user', id: 'founder', bindings: [], scopes: null };
    expect(await run(mockCtx({ actor: creator, tenantId: testTenantId }))).toHaveBeenCalled();

    vi.mocked(countOrganizationsByTenant).mockResolvedValue(1);
    const error = await runExpectingError(mockCtx({ actor: creator, tenantId: testTenantId }));
    expect(error.status).toBe(403);
    expect(error.meta).toEqual({ resource: 'tenant' });
  });

  it('refuses a service account whose key belongs to another tenant, before any lookup', async () => {
    // No cache entry for the URL tenant: a lookup would have to hit the database.
    const error = await runExpectingError(mockCtx({ actor: service(testTenantId), tenantId: otherTenantId }));
    expect(error.status).toBe(403);
  });

  it('admits a service account in its own tenant only when it holds a grant there', async () => {
    expect(await run(mockCtx({ actor: service(testTenantId), tenantId: testTenantId }))).toHaveBeenCalled();
    const error = await runExpectingError(mockCtx({ actor: service(testTenantId, []), tenantId: testTenantId }));
    expect(error.status).toBe(403);
  });

  it('refuses an inactive tenant, naming its status only to an actor with a foothold, and a missing tenant id', async () => {
    setTenantCache(testTenantId, tenantRow('suspended'));
    const member = await runExpectingError(mockCtx({ actor: user([membership(testTenantId)]), tenantId: testTenantId }));
    expect(member.status).toBe(403);
    expect(member.meta).toEqual({ resource: 'tenant', tenantStatus: 'suspended' });

    const outsider = await runExpectingError(mockCtx({ actor: user([membership(otherTenantId)]), tenantId: testTenantId }));
    expect(outsider.status).toBe(403);
    expect(outsider.meta).toEqual({ resource: 'tenant' });

    expect((await runExpectingError(mockCtx({ actor: user([]), tenantId: undefined }))).status).toBe(400);
  });

  it('answers a server error without an actor: only a guard order createXRoute refuses gets there', async () => {
    expect((await runExpectingError(mockCtx({ tenantId: testTenantId }))).status).toBe(500);
  });
});
