import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '#/core/context';
import { clearRangeAnswers, issueRangeKey, rangeKeyHeader, readClassOf, sharedRangeAnswers } from './range-answers';

// A kept answer skips the guards. Each case asks what a request without a session, or of another reader, can get.
const state = vi.hoisted(() => ({ writes: 0 }));
vi.mock('#/db/tenant-context', () => ({ tenantWriteCount: () => state.writes }));

// Two admins read every row, a member reads one channel's rows, and an author reads the rows it wrote.
const filters: Record<string, object> = {
  admin1: { orgWide: true, scopes: [] },
  admin2: { orgWide: true, scopes: [] },
  member: { orgWide: false, scopes: [{ channelType: 'organization', channelIds: ['channel-1'] }] },
  author: { orgWide: false, scopes: [{ channelType: 'organization', channelIds: ['org-1'], condition: 'own' }] },
};
vi.mock('#/permissions/collection-scope', () => ({
  resolveCollectionReadFilter: (access: { actorId: string }) => filters[access.actorId],
}));

const scope = { tenantId: 'tenant-1', organizationId: 'org-1', entityType: 'attachment' as const };
const range = '/tenant-1/org-1/attachments?afterSeq=6&untilSeq=7';

let routeRuns = 0;
/** Holds the route's answer back while set, for a request that has to arrive during a read. */
let gate: Promise<void> | undefined;

const app = new Hono<Env>().get(
  '/:tenantId/:organizationId/attachments',
  sharedRangeAnswers('attachment'),
  // Stands in for the guard chain: a request without a user is refused, as one without a session is.
  async (ctx, next) => {
    const userId = ctx.req.header('x-test-user');
    if (!userId) return ctx.json({ refused: true }, 401);
    ctx.set('actor', { kind: 'user', id: userId, bindings: [], scopes: null } as never);
    ctx.set('isSystemAdmin', false);
    ctx.set('tenantId', ctx.req.param('tenantId'));
    ctx.set('organization', { id: ctx.req.param('organizationId') } as never);
    return next();
  },
  async (ctx) => {
    routeRuns++;
    await gate;
    return ctx.json({ answeredFor: ctx.var.actor.id });
  },
);

const get = (url: string, headers: Record<string, string>) => app.request(url, { headers });
const adminKey = () => issueRangeKey({ ...scope, readClass: 'all' }, 0);

describe('sharedRangeAnswers', () => {
  beforeEach(() => {
    clearRangeAnswers();
    state.writes = 0;
    routeRuns = 0;
    gate = undefined;
  });

  it('serves the answer one reader was given to a holder of the key of its read class', async () => {
    const key = adminKey();
    await get(range, { 'x-test-user': 'admin1', [rangeKeyHeader]: key });

    const second = await get(range, { [rangeKeyHeader]: key });

    expect(second.status).toBe(200);
    expect(second.headers.get('x-range-answer')).toBe('kept');
    expect(await second.json()).toEqual({ answeredFor: 'admin1' });
    expect(routeRuns).toBe(1);
  });

  it('keeps no answer that a reader of another read class asked for', async () => {
    const key = adminKey();
    const first = await get(range, { 'x-test-user': 'member', [rangeKeyHeader]: key });
    expect(await first.json()).toEqual({ answeredFor: 'member' });

    expect((await get(range, { [rangeKeyHeader]: key })).status).toBe(401);
  });

  it('serves a kept answer for its own URL alone', async () => {
    const key = adminKey();
    await get(range, { 'x-test-user': 'admin1', [rangeKeyHeader]: key });

    const otherRange = await get('/tenant-1/org-1/attachments?afterSeq=0&untilSeq=7', { [rangeKeyHeader]: key });
    const otherOrganization = await get('/tenant-1/org-2/attachments?afterSeq=6&untilSeq=7', { [rangeKeyHeader]: key });

    expect(otherRange.status).toBe(401);
    expect(otherOrganization.status).toBe(401);
  });

  it('keeps no answer of a requester the guards placed in another organization than the key names', async () => {
    const key = adminKey();
    const otherOrganization = '/tenant-1/org-2/attachments?afterSeq=6&untilSeq=7';
    await get(otherOrganization, { 'x-test-user': 'admin1', [rangeKeyHeader]: key });

    expect((await get(otherOrganization, { [rangeKeyHeader]: key })).status).toBe(401);
  });

  it('serves no kept answer once a write of its tenant committed', async () => {
    const key = adminKey();
    await get(range, { 'x-test-user': 'admin1', [rangeKeyHeader]: key });
    state.writes++;

    const afterWrite = await get(range, { 'x-test-user': 'admin2', [rangeKeyHeader]: key });

    expect(await afterWrite.json()).toEqual({ answeredFor: 'admin2' });
    expect(afterWrite.headers.get('x-range-answer')).toBeNull();
  });

  it('gives no request the answer of a read that a write crossed, whether it waited before or after the write', async () => {
    const key = adminKey();
    const release = Promise.withResolvers<void>();
    gate = release.promise;
    const first = get(range, { 'x-test-user': 'admin1', [rangeKeyHeader]: key });
    await vi.waitFor(() => expect(routeRuns).toBe(1));
    const waitedBefore = get(range, { 'x-test-user': 'admin2', [rangeKeyHeader]: key });

    state.writes++;
    const waitedAfter = get(range, { 'x-test-user': 'admin2', [rangeKeyHeader]: key });
    release.resolve();

    expect(await (await first).json()).toEqual({ answeredFor: 'admin1' });
    expect(await (await waitedBefore).json()).toEqual({ answeredFor: 'admin2' });
    expect(await (await waitedAfter).json()).toEqual({ answeredFor: 'admin2' });
    // The two that waited share one read between them.
    expect(routeRuns).toBe(2);
  });

  it('serves a kept answer a bounded number of times, then runs the route', async () => {
    const key = adminKey();
    await get(range, { 'x-test-user': 'admin1', [rangeKeyHeader]: key });

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await get(range, { [rangeKeyHeader]: key })).status);

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(401);
  });

  it('runs the route for a key on a read that names no range', async () => {
    const key = adminKey();
    const list = '/tenant-1/org-1/attachments';
    await get(list, { 'x-test-user': 'admin1', [rangeKeyHeader]: key });

    expect((await get(list, { [rangeKeyHeader]: key })).status).toBe(401);
  });
});

describe('readClassOf', () => {
  const access = (actorId: string) => ({ actorId, isSystemAdmin: false, memberships: [], scopes: null }) as never;

  it('puts readers of the same rows in one class and a reader of other rows in another', () => {
    expect(readClassOf(access('admin1'), 'attachment', 'org-1')).toBe(readClassOf(access('admin2'), 'attachment', 'org-1'));
    expect(readClassOf(access('member'), 'attachment', 'org-1')).not.toBe(readClassOf(access('admin1'), 'attachment', 'org-1'));
  });

  it('gives a reader of its own rows no class to share', () => {
    expect(readClassOf(access('author'), 'attachment', 'org-1')).toBeNull();
  });
});
