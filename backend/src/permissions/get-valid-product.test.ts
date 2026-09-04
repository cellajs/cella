import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '#/core/context';
import { baseDb } from '#/db/db';
import { tenantRead } from '#/db/tenant-context';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { checkAccess } from '#/permissions';
import { getValidProduct } from '#/permissions/get-valid-product';

vi.mock('#/db/db', () => ({ baseDb: { kind: 'baseDb' } }));
vi.mock('#/db/tenant-context', () => ({
  tenantRead: vi.fn((ctx: AuthContext, fn: (readCtx: AuthContext) => unknown) => fn(ctx)),
}));
vi.mock('#/modules/entities/entities-queries', () => ({ resolveEntity: vi.fn() }));
vi.mock('#/permissions', () => ({ checkAccess: vi.fn() }));
vi.mock('#/permissions/access', () => ({ accessFrom: vi.fn(() => ({})) }));
vi.mock('#/permissions/build-subject', () => ({ buildSubjectFromEntity: vi.fn(() => ({})) }));

const TENANT = 'tenant-a';
const ORG = 'org-a';

/** Scope check unit: the entity lookup, permission engine and RLS wrapper are mocked, so only the tenant/organization comparison is under test. */
describe('getValidProduct request scope', () => {
  const ctx = (
    scope: Partial<{ tenantId: string; organizationId: string }> = { tenantId: TENANT, organizationId: ORG },
  ) => ({ var: { db: baseDb, userId: 'user-1', ...scope } }) as unknown as AuthContext;

  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'att-1',
    entityType: 'attachment',
    tenantId: TENANT,
    organizationId: ORG,
    publicAt: null,
    ...overrides,
  });

  beforeEach(() => {
    vi.mocked(tenantRead).mockClear();
    vi.mocked(resolveEntity).mockReset();
    vi.mocked(checkAccess)
      .mockReset()
      .mockReturnValue({ allowed: true } as ReturnType<typeof checkAccess>);
  });

  it('throws 500 before any lookup when the route set no tenant or organization scope', async () => {
    await expect(getValidProduct(ctx({ tenantId: TENANT }), 'att-1', 'attachment', 'read')).rejects.toMatchObject({
      status: 500,
      type: 'server_error',
    });
    expect(resolveEntity).not.toHaveBeenCalled();
  });

  it('reads a foreign-tenant row as 404 even when the engine would allow it', async () => {
    vi.mocked(resolveEntity).mockResolvedValue(row({ tenantId: 'tenant-b' }) as never);
    await expect(getValidProduct(ctx(), 'att-1', 'attachment', 'read')).rejects.toMatchObject({
      status: 404,
      type: 'not_found',
    });
    expect(checkAccess).not.toHaveBeenCalled();
  });

  it('reads a foreign-organization row as 404', async () => {
    vi.mocked(resolveEntity).mockResolvedValue(row({ organizationId: 'org-b' }) as never);
    await expect(getValidProduct(ctx(), 'att-1', 'attachment', 'read')).rejects.toMatchObject({
      status: 404,
      type: 'not_found',
    });
    expect(checkAccess).not.toHaveBeenCalled();
  });

  it('returns 403 when the row is in scope but the engine denies the action', async () => {
    vi.mocked(resolveEntity).mockResolvedValue(row() as never);
    vi.mocked(checkAccess).mockReturnValue({ allowed: false } as ReturnType<typeof checkAccess>);
    await expect(getValidProduct(ctx(), 'att-1', 'attachment', 'update')).rejects.toMatchObject({
      status: 403,
      type: 'forbidden',
    });
  });

  it('returns the row when it is in scope and allowed, reading through tenantRead on bare baseDb', async () => {
    const entity = row();
    vi.mocked(resolveEntity).mockResolvedValue(entity as never);
    await expect(getValidProduct(ctx(), 'att-1', 'attachment', 'read')).resolves.toEqual({ entity });
    expect(tenantRead).toHaveBeenCalledTimes(1);
  });
});
