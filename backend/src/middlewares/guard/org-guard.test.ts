import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppError } from '#/core/error';
import { clearOrgCache, setOrgCache } from './org-cache';
import { orgGuard } from './org-guard';

// The org row is served from the cache, so the database is reached only on a miss, where this stub
// returns no row. Membership shape is what the guard actually reads.
const TENANT_ID = 'tenant-1';
const ORG_ID = 'org-1';
const OTHER_ORG_ID = 'org-2';

const orgRow = {
  id: ORG_ID,
  tenantId: TENANT_ID,
  entityType: 'organization',
  name: 'Org',
  slug: 'org',
  organizationFlags: {},
  setupConfig: {},
};

/**
 * Membership row as the guard sees it. `channelType` is widened past cella's own vocabulary on
 * purpose: the case this guard has to get right only exists in apps whose hierarchy has channels
 * below the organization, and those rows carry organizationId as an ancestor column.
 */
const membership = (channelType: string, organizationId: string) =>
  ({ channelType, organizationId, channelId: 'channel-1', role: 'member' }) as never;

const emptyDb = { select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }) };

const mockCtx = (opts: { memberships: unknown[]; isSystemAdmin?: boolean; organizationId?: string }) => ({
  req: { param: () => opts.organizationId ?? ORG_ID },
  var: {
    db: emptyDb as never,
    memberships: opts.memberships,
    isSystemAdmin: opts.isSystemAdmin ?? false,
    tenantId: TENANT_ID,
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
    setOrgCache(TENANT_ID, ORG_ID, orgRow as never);
  });

  it('admits an organization-level member and exposes the row on the context', async () => {
    const ctx = mockCtx({ memberships: [membership('organization', ORG_ID)] });

    const next = await run(ctx);

    expect(next).toHaveBeenCalled();
    expect(ctx.set).toHaveBeenCalledWith('organizationId', ORG_ID);
    const [, organization] = ctx.set.mock.calls.find(([key]) => key === 'organization') ?? [];
    expect((organization as { membership: unknown }).membership).toMatchObject({ channelType: 'organization' });
  });

  it('admits a member of a channel below the organization', async () => {
    const ctx = mockCtx({ memberships: [membership('course', ORG_ID)] });

    const next = await run(ctx);

    expect(next).toHaveBeenCalled();
  });

  it('leaves membership null for a sub-channel member, since there is no organization-level row', async () => {
    const ctx = mockCtx({ memberships: [membership('course', ORG_ID)] });

    await run(ctx);

    const [, organization] = ctx.set.mock.calls.find(([key]) => key === 'organization') ?? [];
    expect((organization as { membership: unknown }).membership).toBeNull();
  });

  it('rejects a caller whose only membership is in another organization', async () => {
    const ctx = mockCtx({ memberships: [membership('course', OTHER_ORG_ID)] });

    const error = await runExpectingError(ctx);

    expect(error.status).toBe(403);
  });

  it('rejects a caller with no memberships at all', async () => {
    const ctx = mockCtx({ memberships: [] });

    const error = await runExpectingError(ctx);

    expect(error.status).toBe(403);
  });

  it('admits a system admin holding no membership in the organization', async () => {
    const ctx = mockCtx({ memberships: [], isSystemAdmin: true });

    const next = await run(ctx);

    expect(next).toHaveBeenCalled();
  });

  it('404s when the organization does not resolve within the tenant', async () => {
    const ctx = mockCtx({ memberships: [membership('organization', ORG_ID)], organizationId: 'missing-org' });

    const error = await runExpectingError(ctx);

    expect(error.status).toBe(404);
  });
});
