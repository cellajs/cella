import type { EntityActionType } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserContext } from '#/core/context';
import { baseDb } from '#/db/db';
import { resolveEntities } from '#/modules/entities/entities-queries';
import { checkAccessBatch } from '#/permissions';
import { splitByPermission } from '#/permissions/split-by-permission';

vi.mock('#/db/db', () => ({ baseDb: { kind: 'baseDb' } }));
vi.mock('#/db/tenant-context', () => ({ tenantRead: vi.fn((ctx: UserContext, fn: (readCtx: UserContext) => unknown) => fn(ctx)) }));
vi.mock('#/modules/entities/entities-queries', () => ({ resolveEntities: vi.fn() }));
vi.mock('#/permissions', () => ({ checkAccessBatch: vi.fn() }));
vi.mock('#/permissions/access', () => ({ accessFrom: vi.fn(() => ({})), actorFrom: vi.fn(() => ({ actorId: 'user-1', scopes: null })) }));
vi.mock('#/permissions/build-subject', () => ({ buildSubjectFromEntity: vi.fn(() => ({})) }));

const tenant = 'tenant-a';
const org = 'org-a';

/**
 * The batch twin of the single reads: the entity lookup and the permission engine are mocked, so what is under test is
 * which rows reach the engine and what the caller is told about the rest.
 */
describe('splitByPermission', () => {
  const ctx = { var: { db: baseDb, tenantId: tenant, organizationId: org, actor: { kind: 'user', id: 'user-1', bindings: [], scopes: null } } };
  const caller = ctx as unknown as UserContext;

  const row = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    tenantId: tenant,
    organizationId: org,
    createdBy: 'user-1',
    ...overrides,
  });

  /** The engine's answer per action: every row passes, but the ids listed under the action. */
  const engineDenies = (denied: Partial<Record<EntityActionType, string[]>>) =>
    vi.mocked(checkAccessBatch).mockImplementation(((_access: unknown, action: EntityActionType) => ({
      results: { get: (id: string) => ({ allowed: !denied[action]?.includes(id) }) },
    })) as never);

  beforeEach(() => {
    vi.mocked(resolveEntities).mockReset();
    vi.mocked(checkAccessBatch).mockReset();
    engineDenies({});
  });

  it('lists the rejected ids in request order, so a denied row and a missing one read alike', async () => {
    vi.mocked(resolveEntities).mockResolvedValue([row('own'), row('denied'), row('foreign', { organizationId: 'org-b' })] as never);
    engineDenies({ delete: ['denied'] });

    const split = await splitByPermission(caller, 'delete', 'attachment', ['denied', 'missing', 'own', 'foreign']);

    expect(split).toEqual({ allowedIds: ['own'], rejectedIds: ['denied', 'missing', 'foreign'] });
  });

  it('acts on a row named in another letter case, as the single read does, under the id the row has', async () => {
    const stored = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    vi.mocked(resolveEntities).mockResolvedValue([row(stored)] as never);

    const split = await splitByPermission(caller, 'delete', 'attachment', [stored.toUpperCase(), stored, 'missing']);

    expect(split).toEqual({ allowedIds: [stored], rejectedIds: ['missing'] });
  });

  it("must not act on another author's draft via a grant on its home, as the single read answers it as missing", async () => {
    const drafts = [row('own-draft', { publishedAt: null }), row('their-draft', { publishedAt: null, createdBy: 'user-2' })];
    vi.mocked(resolveEntities).mockResolvedValue(drafts as never);

    const split = await splitByPermission(caller, 'delete', 'attachment', ['their-draft', 'own-draft']);

    expect(split).toEqual({ allowedIds: ['own-draft'], rejectedIds: ['their-draft'] });
  });

  it('must not act on a row the caller may not read, as the single read answers it as missing', async () => {
    vi.mocked(resolveEntities).mockResolvedValue([row('unreadable'), row('readable')] as never);
    engineDenies({ read: ['unreadable'] });

    const split = await splitByPermission(caller, 'delete', 'attachment', ['unreadable', 'readable']);

    expect(split).toEqual({ allowedIds: ['readable'], rejectedIds: ['unreadable'] });
  });

  it('must not act on a draft channel the lists hide from the caller', async () => {
    vi.mocked(resolveEntities).mockResolvedValue([
      { id: org, tenantId: tenant, publishedAt: null },
      { id: 'org-c', tenantId: tenant },
    ] as never);

    const split = await splitByPermission(caller, 'delete', 'organization', [org, 'org-c']);

    expect(split).toEqual({ allowedIds: ['org-c'], rejectedIds: [org] });
  });

  it('refuses a batch that may act on none of its ids, whatever each id names', async () => {
    vi.mocked(resolveEntities).mockResolvedValue([row('their-draft', { publishedAt: null, createdBy: 'user-2' })] as never);

    await expect(splitByPermission(caller, 'delete', 'attachment', ['their-draft', 'missing'])).rejects.toMatchObject({
      status: 403,
      type: 'forbidden',
    });
  });
});
