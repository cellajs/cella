import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '#/core/context';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { checkAccess } from '#/permissions';
import { getValidChannel } from '#/permissions/get-valid-channel';

vi.mock('#/modules/entities/entities-queries', () => ({ resolveEntity: vi.fn() }));
vi.mock('#/permissions', () => ({ checkAccess: vi.fn() }));
vi.mock('#/permissions/access', () => ({ accessFrom: vi.fn(() => ({})) }));
vi.mock('#/permissions/build-subject', () => ({ buildSubjectFromEntity: vi.fn(() => ({})) }));

const TENANT = 'tenant-a';
const ORG = 'org-a';

/** Scope check unit: the entity lookup and permission engine are mocked, so only the tenant/organization comparison is under test. */
describe('getValidChannel request scope', () => {
  const ctx = (scope: Partial<{ tenantId: string; organizationId: string }> = {}) =>
    ({ var: { db: {}, userId: 'user-1', ...scope } }) as unknown as AuthContext;

  const organization = { id: ORG, entityType: 'organization', tenantId: TENANT };

  beforeEach(() => {
    vi.mocked(resolveEntity).mockReset();
    vi.mocked(checkAccess)
      .mockReset()
      .mockReturnValue({ allowed: true, membership: null } as ReturnType<typeof checkAccess>);
  });

  it('compares nothing on a cross-tenant route that set no scope', async () => {
    vi.mocked(resolveEntity).mockResolvedValue(organization as never);
    await expect(getValidChannel(ctx(), ORG, 'organization', 'read')).resolves.toEqual({
      entity: organization,
      membership: null,
    });
  });

  it('reads a foreign-tenant channel as 404 without consulting the engine', async () => {
    vi.mocked(resolveEntity).mockResolvedValue({ ...organization, tenantId: 'tenant-b' } as never);
    await expect(getValidChannel(ctx({ tenantId: TENANT }), ORG, 'organization', 'read')).rejects.toMatchObject({
      status: 404,
      type: 'not_found',
    });
    expect(checkAccess).not.toHaveBeenCalled();
  });

  it('skips the organization comparison for the organization row, which carries no organizationId', async () => {
    vi.mocked(resolveEntity).mockResolvedValue(organization as never);
    await expect(
      getValidChannel(ctx({ tenantId: TENANT, organizationId: ORG }), ORG, 'organization', 'read'),
    ).resolves.toEqual({
      entity: organization,
      membership: null,
    });
  });

  it('reads a sub-channel from another organization as 404', async () => {
    const foreign = { id: 'ch-1', entityType: 'channel', tenantId: TENANT, organizationId: 'org-b' };
    vi.mocked(resolveEntity).mockResolvedValue(foreign as never);
    await expect(
      getValidChannel(ctx({ tenantId: TENANT, organizationId: ORG }), 'ch-1', 'organization', 'read'),
    ).rejects.toMatchObject({ status: 404, type: 'not_found' });
  });

  it('returns 403 when the channel is in scope but the engine denies the action', async () => {
    vi.mocked(resolveEntity).mockResolvedValue(organization as never);
    vi.mocked(checkAccess).mockReturnValue({ allowed: false, membership: null } as ReturnType<typeof checkAccess>);
    await expect(getValidChannel(ctx({ tenantId: TENANT }), ORG, 'organization', 'update')).rejects.toMatchObject({
      status: 403,
      type: 'forbidden',
    });
  });
});
