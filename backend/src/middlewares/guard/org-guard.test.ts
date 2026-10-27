import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { AppError } from '#/core/error';
import { baseDb, getSeedDb } from '#/db/db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { mockOrganization } from '#/modules/organization/organization-mocks';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { invalidateCache } from './invalidate-cache';
import { clearOrgCache, setOrgCache } from './org-cache';
import { orgGuard } from './org-guard';

// The org row is served from the cache, so the database is reached only on a miss, where this stub
// returns no row. Membership shape is what the guard actually reads.
const tenantId = 'tenant-1';
const orgId = 'org-1';
const otherOrgId = 'org-2';

const orgRow = { id: orgId, tenantId: tenantId, entityType: 'organization', name: 'Org', slug: 'org', organizationFlags: {}, setupConfig: {} };

/**
 * Membership row as the guard sees it. `channelType` is widened past cella's own vocabulary on
 * purpose: the case this guard has to get right only exists in apps whose hierarchy has channels
 * below the organization, and those rows carry organizationId as an ancestor column.
 */
// A user's grant is its membership row: `userId` is what tells it apart from a service account's grant.
const membership = (channelType: string, organizationId: string) =>
  ({ channelType, organizationId, channelId: 'channel-1', role: 'member', userId: 'user-1' }) as never;

const emptyDb = { select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }) };

const mockCtx = (opts: { memberships: unknown[]; isSystemAdmin?: boolean; organizationId?: string; tenantId?: string; db?: unknown }) => ({
  req: { param: () => opts.organizationId ?? orgId },
  var: {
    db: (opts.db ?? emptyDb) as never,
    memberships: opts.memberships,
    // The guard reads the actor's bindings; for a session those are the memberships.
    actor: { kind: 'user', id: 'user-1', bindings: opts.memberships, scopes: null },
    isSystemAdmin: opts.isSystemAdmin ?? false,
    tenantId: opts.tenantId ?? tenantId,
  },
  set: vi.fn(),
});

const run = async (ctx: ReturnType<typeof mockCtx>) => {
  const next = vi.fn();
  await orgGuard(ctx as never, next);
  return next;
};

const runExpectingError = async (ctx: ReturnType<typeof mockCtx>) => {
  try {
    await run(ctx);
  } catch (error) {
    return error as AppError;
  }
  throw new Error('expected orgGuard to throw');
};

describe('orgGuard — organization access', () => {
  beforeEach(() => {
    clearOrgCache();
    setOrgCache(tenantId, orgId, orgRow as never);
  });

  it('admits an organization-level member and exposes the row on the context', async () => {
    const ctx = mockCtx({ memberships: [membership('organization', orgId)] });

    const next = await run(ctx);

    expect(next).toHaveBeenCalled();
    expect(ctx.set).toHaveBeenCalledWith('organizationId', orgId);
    const [, organization] = ctx.set.mock.calls.find(([key]) => key === 'organization') ?? [];
    expect((organization as { membership: unknown }).membership).toMatchObject({ channelType: 'organization' });
  });

  it('admits a member of a channel below the organization', async () => {
    const ctx = mockCtx({ memberships: [membership('course', orgId)] });

    const next = await run(ctx);

    expect(next).toHaveBeenCalled();
  });

  it('leaves membership null for a sub-channel member, since there is no organization-level row', async () => {
    const ctx = mockCtx({ memberships: [membership('course', orgId)] });

    await run(ctx);

    const [, organization] = ctx.set.mock.calls.find(([key]) => key === 'organization') ?? [];
    expect((organization as { membership: unknown }).membership).toBeNull();
  });

  // A caller without a foothold gets the answer a missing organization gets, so the id is never confirmed.
  it('must not confirm the organization to a caller whose only membership is in another organization', async () => {
    const ctx = mockCtx({ memberships: [membership('course', otherOrgId)] });

    const error = await runExpectingError(ctx);

    expect(error).toMatchObject({ status: 404, type: 'not_found', entityType: 'organization' });
  });

  it('must not confirm the organization to a caller with no memberships at all', async () => {
    const ctx = mockCtx({ memberships: [] });

    const error = await runExpectingError(ctx);

    expect(error).toMatchObject({ status: 404, type: 'not_found', entityType: 'organization' });
  });

  it('admits a system admin holding no membership in the organization', async () => {
    const ctx = mockCtx({ memberships: [], isSystemAdmin: true });

    const next = await run(ctx);

    expect(next).toHaveBeenCalled();
  });
});

// The lookup on a cache miss runs against the database: the request's tenant bounds it, so an organization id
// from another tenant does not resolve, whoever asks.
describe('orgGuard — organization lookup within the tenant', () => {
  const seedDb = getSeedDb();
  let organization: { id: string; tenantId: string; name: string };
  let otherTenantId: string;

  beforeAll(async () => {
    const [own, other] = await seedDb
      .insert(tenantsTable)
      .values([{ name: 'org guard tenant' }, { name: 'org guard other tenant' }])
      .returning({ id: tenantsTable.id });
    [organization] = await seedDb
      .insert(organizationsTable)
      .values({ ...mockOrganization(), tenantId: own.id })
      .returning({ id: organizationsTable.id, tenantId: organizationsTable.tenantId, name: organizationsTable.name });
    otherTenantId = other.id;
  });

  afterAll(async () => {
    await seedDb.delete(organizationsTable).where(eq(organizationsTable.id, organization.id));
    await seedDb.delete(tenantsTable).where(inArray(tenantsTable.id, [organization.tenantId, otherTenantId]));
  });

  beforeEach(() => clearOrgCache());

  it("must not resolve another tenant's organization via its id, for a member of it or a system admin", async () => {
    const asMember = mockCtx({
      memberships: [membership('organization', organization.id)],
      organizationId: organization.id,
      tenantId: otherTenantId,
      db: baseDb,
    });
    expect((await runExpectingError(asMember)).status).toBe(404);

    const asSystemAdmin = mockCtx({ memberships: [], isSystemAdmin: true, organizationId: organization.id, tenantId: otherTenantId, db: baseDb });
    expect((await runExpectingError(asSystemAdmin)).status).toBe(404);
  });

  it('must not serve the row from before an update via an organization id spelled in upper case', async () => {
    const read = async () => {
      const ctx = mockCtx({
        memberships: [membership('organization', organization.id)],
        organizationId: organization.id.toUpperCase(),
        tenantId: organization.tenantId,
        db: baseDb,
      });
      await run(ctx);
      const [, resolved] = ctx.set.mock.calls.find(([key]) => key === 'organization') ?? [];
      return resolved as { name: string };
    };

    expect((await read()).name).toBe(organization.name);
    const rename = async (name: string) => {
      await seedDb.update(organizationsTable).set({ name }).where(eq(organizationsTable.id, organization.id));
    };
    await rename('renamed');
    onTestFinished(() => rename(organization.name));
    // What an update operation does once its write commits.
    invalidateCache.org(organization.tenantId, organization.id);

    expect((await read()).name).toBe('renamed');
  });

  it('resolves the organization within its own tenant and exposes the stored row (positive control)', async () => {
    const ctx = mockCtx({
      memberships: [membership('organization', organization.id)],
      organizationId: organization.id,
      tenantId: organization.tenantId,
      db: baseDb,
    });

    const next = await run(ctx);

    expect(next).toHaveBeenCalled();
    const [, resolved] = ctx.set.mock.calls.find(([key]) => key === 'organization') ?? [];
    expect(resolved).toMatchObject({ id: organization.id, tenantId: organization.tenantId, name: organization.name });
  });
});
