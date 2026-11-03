import type { QueryKey } from '@tanstack/react-query';
import type { StreamSignal } from 'sdk';
import type { ChannelEntityType, ProductEntityType } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubLocalStorage } from '~/query/tests/query-client-env';

// An app's shape: tasks below a project, notes at the organization.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const roles = actual.createRoleRegistry(['member'] as const);
  const hierarchy = actual
    .createEntityHierarchy(roles)
    .user()
    .organization({ roles: roles.all })
    .channel('project', { parent: 'organization', roles: roles.all })
    .product('task', { parent: 'project' })
    .product('note', { parent: 'organization' })
    .build();
  return {
    ...actual,
    appConfig: {
      slug: 'test',
      channelEntityTypes: hierarchy.channelTypes,
      entityIdColumnKeys: hierarchy.idColumnKeys,
      seenTrackedProductTypes: ['task'],
      productEmbeddings: [],
    },
    hierarchy,
    isChannel: hierarchy.isChannel,
    isProduct: hierarchy.isProduct,
  };
});

const invalidateMemberships = vi.fn();
const invalidateMemberQueries = vi.fn();
vi.mock('~/query/realtime/membership-ops', () => ({
  invalidateMemberships: () => invalidateMemberships(),
  invalidateMemberQueries: (organizationId: string) => invalidateMemberQueries(organizationId),
}));
// The deleted project is not on screen: the marks wait for the lists to be opened.
vi.mock('~/query/realtime/sync-priority', () => ({ isViewingChannel: () => false }));
vi.mock('~/query/offline/hlc', () => ({ sourceId: 'test-source' }));
vi.mock('~/routes/router', () => ({ router: { subscribe: vi.fn(), state: { matches: [] } } }));

stubLocalStorage();

const { meKeys } = await import('~/modules/me/query');
const { seenKeys } = await import('~/modules/seen/helpers');
const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { onChangeEvent } = await import('~/query/realtime/sync-events');
const { handleChannelDeleted } = await import('~/query/realtime/channel-deleted');

// The synthetic types exist only in this file's shared mock, hence the casts.
const taskType = 'task' as ProductEntityType;
const noteType = 'note' as ProductEntityType;
const projectType = 'project' as ChannelEntityType;
const taskKeys = createEntityKeys<Record<string, never>>(taskType);
const noteKeys = createEntityKeys<Record<string, never>>(noteType);
const projectKeys = createEntityKeys<Record<string, never>>(projectType);
registerEntityQueryKeys(taskType, taskKeys);
registerEntityQueryKeys(noteType, noteKeys);
registerEntityQueryKeys(projectType, projectKeys);

const task = (id: string, projectId: string) => ({ id, organizationId: 'org-1', projectId });
const list = <T>(items: T[]) => ({ items, total: items.length });

const homeOfP1: QueryKey = taskKeys.list.home('org-1', 'p1');
const homeOfP2: QueryKey = taskKeys.list.home('org-1', 'p2');
const acrossProjects: QueryKey = [...taskKeys.list.org('org-1'), { q: '' }];
const notes: QueryKey = noteKeys.list.home('org-1');

/** What an org admin outside project p1 holds: p1's tasks in its home list, an org-wide list and a detail, and p2 beside it. */
function seedCache() {
  queryClient.setQueryData(homeOfP1, list([task('t1', 'p1'), task('t2', 'p1')]));
  queryClient.setQueryData(homeOfP2, list([task('t3', 'p2')]));
  queryClient.setQueryData(acrossProjects, list([task('t1', 'p1'), task('t3', 'p2')]));
  queryClient.setQueryData(taskKeys.detail.byId('t1'), task('t1', 'p1'));
  queryClient.setQueryData(notes, list([{ id: 'n1', organizationId: 'org-1' }]));
  queryClient.setQueryData(projectKeys.list.org('org-1'), list([{ id: 'p1' }, { id: 'p2' }]));
  queryClient.setQueryData(projectKeys.detail.byId('p1'), { id: 'p1' });
  queryClient.setQueryData(meKeys.memberships, { items: [{ organizationId: 'org-1', channelId: 'p1' }] });
  queryClient.setQueryData(seenKeys.unseenCounts, {});
}

const signal = (overrides: Partial<StreamSignal> = {}): StreamSignal => ({
  type: 'channel.deleted',
  organizationId: 'org-1',
  subjectId: 'p1',
  version: null,
  ...overrides,
});

// Past the handler's window for the rest of a cascade, short of the cache's garbage collection.
const cascadeSettles = () => vi.advanceTimersByTime(1_000);

const idsOf = (key: QueryKey) => queryClient.getQueryData<{ items: { id: string }[] }>(key)?.items.map(({ id }) => id);
const isMarked = (key: QueryKey) => queryClient.getQueryState(key)?.isInvalidated;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  queryClient.clear();
  vi.clearAllMocks();
});

describe('channel.deleted', () => {
  it('drops the cached rows a deleted project took by cascade, the project itself, and marks the lists of what lived below it', () => {
    seedCache();
    const announced: string[] = [];
    const stop = onChangeEvent(({ action, subjectId }) => announced.push(`${action}:${subjectId}`));

    handleChannelDeleted(signal());
    stop();
    cascadeSettles();

    // The cascade sent no change for these rows: without the signal they stay in every list and detail.
    expect(idsOf(homeOfP1)).toEqual([]);
    expect(idsOf(acrossProjects)).toEqual(['t3']);
    expect(queryClient.getQueryData<{ total: number }>(acrossProjects)?.total).toBe(1);
    expect(queryClient.getQueryData(taskKeys.detail.byId('t1'))).toBeUndefined();
    expect(idsOf(homeOfP2)).toEqual(['t3']);
    expect(announced.toSorted()).toEqual(['delete:t1', 'delete:t2']);

    // Rows below it that were never cached still count in the server's lists: each one refetches when opened.
    for (const key of [homeOfP1, homeOfP2, acrossProjects]) expect(isMarked(key)).toBe(true);
    expect(isMarked(notes)).toBe(false);
    expect(isMarked(seenKeys.unseenCounts)).toBe(true);

    expect(idsOf(projectKeys.list.org('org-1'))).toEqual(['p2']);
    expect(queryClient.getQueryData(projectKeys.detail.byId('p1'))).toBeUndefined();
    expect(invalidateMemberships).toHaveBeenCalled();
  });

  it('refetches once for a whole cascade: each channel it reached sends a signal of its own', () => {
    seedCache();

    handleChannelDeleted(signal());
    handleChannelDeleted(signal({ subjectId: 'p2' }));
    cascadeSettles();

    expect(idsOf(homeOfP2)).toEqual([]);
    expect(invalidateMemberQueries.mock.calls).toEqual([['org-1']]);
    expect(invalidateMemberships).toHaveBeenCalledTimes(1);
  });

  it('missed while away, it names no channel: the lists of every type below a channel take the mark, and no row is dropped', () => {
    seedCache();

    handleChannelDeleted(signal({ subjectId: null, version: 4 }));
    cascadeSettles();

    expect(idsOf(homeOfP1)).toEqual(['t1', 't2']);
    for (const key of [homeOfP1, homeOfP2, acrossProjects]) expect(isMarked(key)).toBe(true);
    expect(isMarked(notes)).toBe(false);
  });
});
