import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserContext } from '#/core/context';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { checkAccess } from '#/permissions';
import { getValidChannel, resolveChannelInScope } from '#/permissions/get-valid-channel';

vi.mock('#/modules/entities/entities-queries', () => ({ resolveEntity: vi.fn() }));
vi.mock('#/permissions', () => ({ checkAccess: vi.fn() }));
vi.mock('#/permissions/access', () => ({ accessFrom: vi.fn(() => ({})), actorFrom: vi.fn(() => ({ actorId: 'user-1', scopes: null })) }));
vi.mock('#/permissions/build-subject', () => ({ buildSubjectFromEntity: vi.fn(() => ({})) }));

const tenant = 'tenant-a';
const org = 'org-a';

/** Scope check unit: the entity lookup and permission engine are mocked, so only the tenant/organization comparison is under test. */
describe('getValidChannel request scope', () => {
  const ctx = (scope: Partial<{ tenantId: string; organizationId: string }> = {}, bindings: unknown[] = []) =>
    ({ var: { db: {}, userId: 'user-1', actor: { id: 'user-1', bindings, scopes: null }, ...scope } }) as unknown as UserContext;

  const organization = { id: org, entityType: 'organization', tenantId: tenant };

  beforeEach(() => {
    vi.mocked(resolveEntity).mockReset();
    vi.mocked(checkAccess)
      .mockReset()
      .mockReturnValue({ allowed: true, membership: null } as ReturnType<typeof checkAccess>);
  });

  it('compares nothing on a cross-tenant route that set no scope', async () => {
    vi.mocked(resolveEntity).mockResolvedValue(organization as never);
    await expect(getValidChannel(ctx(), org, 'organization', 'read')).resolves.toEqual({ entity: organization, membership: null });
  });

  it('reads a foreign-tenant channel as 404 without consulting the engine', async () => {
    vi.mocked(resolveEntity).mockResolvedValue({ ...organization, tenantId: 'tenant-b' } as never);
    await expect(getValidChannel(ctx({ tenantId: tenant }), org, 'organization', 'read')).rejects.toMatchObject({ status: 404, type: 'not_found' });
    expect(checkAccess).not.toHaveBeenCalled();
  });

  it('skips the organization comparison for the organization row, which carries no organizationId', async () => {
    vi.mocked(resolveEntity).mockResolvedValue(organization as never);
    await expect(getValidChannel(ctx({ tenantId: tenant, organizationId: org }), org, 'organization', 'read')).resolves.toEqual({
      entity: organization,
      membership: null,
    });
  });

  it('reads a sub-channel from another organization as 404', async () => {
    const foreign = { id: 'ch-1', entityType: 'channel', tenantId: tenant, organizationId: 'org-b' };
    vi.mocked(resolveEntity).mockResolvedValue(foreign as never);
    await expect(getValidChannel(ctx({ tenantId: tenant, organizationId: org }), 'ch-1', 'organization', 'read')).rejects.toMatchObject({
      status: 404,
      type: 'not_found',
    });
  });

  it('reads a channel the engine denies `read` on as 404, whatever the action asked', async () => {
    vi.mocked(resolveEntity).mockResolvedValue(organization as never);
    vi.mocked(checkAccess).mockReturnValue({ allowed: false, membership: null } as ReturnType<typeof checkAccess>);
    for (const action of ['read', 'update'] as const) {
      await expect(getValidChannel(ctx({ tenantId: tenant }), org, 'organization', action)).rejects.toMatchObject({ status: 404, type: 'not_found' });
    }
  });

  it('returns 403 when the caller reads the channel but the engine denies the action', async () => {
    vi.mocked(resolveEntity).mockResolvedValue(organization as never);
    vi.mocked(checkAccess).mockImplementation(
      (_access, action) => ({ allowed: action === 'read', membership: null }) as ReturnType<typeof checkAccess>,
    );
    await expect(getValidChannel(ctx({ tenantId: tenant }), org, 'organization', 'update')).rejects.toMatchObject({
      status: 403,
      type: 'forbidden',
      meta: { action: 'update' },
    });
  });

  it('reads a draft the caller is no member of as 404, whatever the action asked and the engine allows', async () => {
    vi.mocked(resolveEntity).mockResolvedValue({ ...organization, publishedAt: null } as never);
    for (const action of ['read', 'update', 'delete'] as const) {
      await expect(getValidChannel(ctx({ tenantId: tenant }), org, 'organization', action)).rejects.toMatchObject({ status: 404, type: 'not_found' });
    }
  });

  it('reads a published channel on a context without an actor, as a public route has', async () => {
    vi.mocked(resolveEntity).mockResolvedValue(organization as never);
    const anonymous = { var: { db: {}, tenantId: tenant } } as unknown as UserContext;
    await expect(getValidChannel(anonymous, org, 'organization', 'read')).resolves.toEqual({ entity: organization, membership: null });
  });

  it('returns a draft to a member of the channel itself', async () => {
    const draft = { ...organization, publishedAt: null };
    vi.mocked(resolveEntity).mockResolvedValue(draft as never);
    const member = ctx({ tenantId: tenant }, [{ channelType: 'organization', channelId: org, organizationId: org, role: 'member' }]);
    await expect(getValidChannel(member, org, 'organization', 'read')).resolves.toEqual({ entity: draft, membership: null });
  });

  it('resolveChannelInScope returns the row in scope without consulting the engine', async () => {
    vi.mocked(resolveEntity).mockResolvedValue(organization as never);
    await expect(resolveChannelInScope(ctx({ tenantId: tenant }), org, 'organization')).resolves.toEqual(organization);
    expect(checkAccess).not.toHaveBeenCalled();
  });

  it('resolveChannelInScope reads a missing and a foreign-tenant row as the same 404', async () => {
    vi.mocked(resolveEntity).mockResolvedValue(undefined as never);
    await expect(resolveChannelInScope(ctx({ tenantId: tenant }), org, 'organization')).rejects.toMatchObject({ status: 404, type: 'not_found' });
    vi.mocked(resolveEntity).mockResolvedValue({ ...organization, tenantId: 'tenant-b' } as never);
    await expect(resolveChannelInScope(ctx({ tenantId: tenant }), org, 'organization')).rejects.toMatchObject({ status: 404, type: 'not_found' });
  });
});
