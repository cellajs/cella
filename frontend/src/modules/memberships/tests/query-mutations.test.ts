import '~/query/tests/query-client-env';
import type { MembershipBase } from 'sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedChannel } from '~/modules/entities/types';
import type { Member } from '~/modules/memberships/types';

// The hooks return their options, so each lifecycle callback runs without rendering.
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useMutation: (options: unknown) => options,
}));
vi.mock('i18next', async (importOriginal) => ({ ...(await importOriginal<typeof import('i18next')>()), t: (key: string) => key }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { meKeys } = await import('~/modules/me/query');
const { membersListQueryOptions } = await import('~/modules/memberships/query');
const { toaster } = await import('~/modules/common/toaster/toaster');
const { useChangeEntityRoleMutation, useMemberUpdateMutation, useMembershipsDeleteMutation } = await import('~/modules/memberships/query-mutations');

type Options<TData, TVariables, TContext = unknown> = {
  onMutate: (variables: TVariables) => Promise<TContext>;
  onSuccess: (data: TData, variables: TVariables, context: TContext) => unknown;
  onError: (error: Error, variables: TVariables, context: TContext) => unknown;
};

/** The mocked useMutation hands back its options, which the hook's return type does not describe. */
const optionsOf = <TOptions>(useHook: () => unknown) => useHook() as TOptions;

const orgKeys = createEntityKeys<Record<string, never>>('organization');

const membership = (id: string, overrides: Partial<MembershipBase> = {}) =>
  ({
    id,
    tenantId: 'tenant-1',
    userId: 'me',
    channelType: 'organization',
    channelId: `channel-${id}`,
    role: 'member',
    ...overrides,
  }) as MembershipBase;

beforeEach(() => registerEntityQueryKeys('organization', orgKeys));
afterEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

describe('useChangeEntityRoleMutation', () => {
  type RoleResult = { entity: EnrichedChannel; membership: MembershipBase; wasNew: boolean };
  const options = () => optionsOf<Options<RoleResult, unknown>>(useChangeEntityRoleMutation);

  it('writes the new membership into every organization list and into my memberships', () => {
    const flatKey = orgKeys.list.home('org-1');
    const infiniteKey = [...orgKeys.list.base, { q: '' }];
    const otherTypeKey = ['attachment', 'list', 'org-1', 'org-1'];
    queryClient.setQueryData(flatKey, { items: [{ id: 'org-1', name: 'One' }, { id: 'org-2' }], total: 2 });
    queryClient.setQueryData(infiniteKey, {
      pages: [{ items: [{ id: 'org-2' }, { id: 'org-1', name: 'One' }], total: 2 }],
      pageParams: [{ page: 0, offset: 0 }],
    });
    queryClient.setQueryData(otherTypeKey, { items: [{ id: 'org-1' }], total: 1 });
    queryClient.setQueryData(meKeys.memberships, { items: [membership('m-1', { channelId: 'org-1' })] });

    const updated = membership('m-1', { channelId: 'org-1', role: 'admin' });
    const entity = { id: 'org-1', entityType: 'organization', name: 'One' } as EnrichedChannel;
    options().onSuccess({ entity, membership: updated, wasNew: false }, undefined, undefined);

    const expectedRow = { ...entity, membership: updated };
    expect(queryClient.getQueryData(flatKey)).toEqual({ items: [expectedRow, { id: 'org-2' }], total: 2 });
    expect(queryClient.getQueryData(infiniteKey)).toEqual({
      pages: [{ items: [{ id: 'org-2' }, expectedRow], total: 2 }],
      pageParams: [{ page: 0, offset: 0 }],
    });
    expect(queryClient.getQueryData(otherTypeKey)).toEqual({ items: [{ id: 'org-1' }], total: 1 });
    expect(queryClient.getQueryData(meKeys.memberships)).toEqual({ items: [updated] });
  });

  it('leaves lists without the entity untouched', () => {
    const flatKey = orgKeys.list.home('org-1');
    const flat = { items: [{ id: 'org-2' }], total: 1 };
    queryClient.setQueryData(flatKey, flat);

    const entity = { id: 'org-1', entityType: 'organization' } as EnrichedChannel;
    options().onSuccess({ entity, membership: membership('m-1'), wasNew: true }, undefined, undefined);

    expect(queryClient.getQueryData(flatKey)).toBe(flat);
  });
});

const scope = { entityId: 'org-1', entityType: 'organization', tenantId: 'tenant-1', organizationId: 'org-1' } as const;
// Members lists are paged in the app; the untagged copies also seed flat lists, which the writes handle too.
const pagedKey = [...membersListQueryOptions(scope).queryKey];
const searchKey = [...membersListQueryOptions({ ...scope, q: 'ada' }).queryKey];
const roleKey = [...membersListQueryOptions({ ...scope, role: 'member' }).queryKey];
const otherChannelKey = [...membersListQueryOptions({ ...scope, entityId: 'org-2' }).queryKey];

const member = (id: string, role: MembershipBase['role'] = 'member') =>
  ({ id, name: id, membership: membership(`m-${id}`, { userId: id, channelId: 'org-1', role }) }) as Member;

type MemberList = { items: Member[]; total: number } | { pages: { items: Member[]; total: number }[]; pageParams: unknown[] };
const readList = (key: readonly unknown[]) => queryClient.getQueryData<MemberList>(key);
const listItems = (data?: MemberList) => (data && 'pages' in data ? data.pages.flatMap((page) => page.items) : data?.items);
const pageTotals = (data?: MemberList) => (data && 'pages' in data ? data.pages.map((page) => page.total) : []);
const firstPageParam = (data?: MemberList) => (data && 'pages' in data ? data.pageParams[0] : undefined);

/** A paged list over two pages, a flat search list, a role-filtered list and another channel's list. */
function seedMemberLists() {
  queryClient.setQueryData(pagedKey, {
    pages: [
      { items: [member('u1'), member('u2')], total: 3 },
      { items: [member('u3')], total: 3 },
    ],
    pageParams: [
      { page: 0, offset: 0 },
      { page: 1, offset: 2 },
    ],
  });
  queryClient.setQueryData(searchKey, { items: [member('u1')], total: 1 });
  queryClient.setQueryData(roleKey, { items: [member('u1'), member('u2')], total: 2 });
  queryClient.setQueryData(otherChannelKey, { items: [member('u1')], total: 1 });
  queryClient.setQueryData(meKeys.memberships, { items: [membership('m-u1', { userId: 'u1', channelId: 'org-1' })] });
  return new Map<readonly unknown[], MemberList | undefined>([pagedKey, searchKey, roleKey, otherChannelKey].map((key) => [key, readList(key)]));
}

describe('useMemberUpdateMutation', () => {
  type Context = { queryChannel: [readonly unknown[], unknown, string | null][]; toastMessage: string };
  const variables = {
    path: { id: 'm-u1', tenantId: 'tenant-1', organizationId: 'org-1' },
    body: { role: 'admin' as const },
    channelId: 'org-1',
    channelType: 'organization' as const,
  };
  const options = () => optionsOf<Options<MembershipBase, typeof variables, Context>>(useMemberUpdateMutation);

  it('onMutate: merges the role into the membership in every list of the channel and into my memberships', async () => {
    const before = seedMemberLists();

    const context = await options().onMutate(variables);

    for (const key of [pagedKey, searchKey, roleKey]) {
      const u1 = listItems(readList(key))?.find((row) => row.id === 'u1');
      expect(u1?.membership).toEqual({ ...member('u1').membership, role: 'admin' });
    }
    expect(listItems(readList(pagedKey))?.map((row) => [row.id, row.membership.role])).toEqual([
      ['u1', 'admin'],
      ['u2', 'member'],
      ['u3', 'member'],
    ]);
    expect(new Set(pageTotals(readList(pagedKey)))).toEqual(new Set([3]));
    expect(firstPageParam(readList(pagedKey))).toEqual({ page: 0, offset: 0 });
    expect(readList(searchKey)).toMatchObject({ total: 1 });
    expect(readList(otherChannelKey)).toBe(before.get(otherChannelKey));
    expect(queryClient.getQueryData(meKeys.memberships)).toEqual({
      items: [{ ...membership('m-u1', { userId: 'u1', channelId: 'org-1' }), role: 'admin' }],
    });

    // One rollback entry per list of the channel, holding the data from before the write.
    expect(context.queryChannel).toHaveLength(3);
    for (const [key, previous, id] of context.queryChannel) {
      expect(previous).toBe(before.get(key));
      expect(id).toBe('m-u1');
    }
  });

  it('onSuccess: refetches role-filtered lists and writes the server membership into the others', async () => {
    seedMemberLists();
    const context = await options().onMutate(variables);
    const server = { ...member('u1').membership, role: 'admin', modifiedAt: '2026-09-30' } as MembershipBase;

    await options().onSuccess(server, variables, context);

    expect(queryClient.getQueryState(roleKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(pagedKey)?.isInvalidated).toBe(false);
    const u1 = listItems(readList(pagedKey))?.find((row) => row.id === 'u1');
    expect(u1?.membership).toEqual(server);
    expect(firstPageParam(readList(pagedKey))).toEqual({ page: 0, offset: 0 });
    expect(listItems(readList(searchKey))?.[0].membership).toEqual(server);
    expect(queryClient.getQueryData<{ items: MembershipBase[] }>(meKeys.memberships)?.items[0]).toMatchObject({
      role: 'admin',
      modifiedAt: '2026-09-30',
    });
    expect(context.toastMessage).toBe('c:success.update_item');
    expect(toaster.success).toHaveBeenCalledWith('c:success.update_item');
  });

  it('onError: restores every list from the rollback entries and refetches my memberships', async () => {
    const before = seedMemberLists();
    const context = await options().onMutate(variables);

    options().onError(new Error('rejected'), variables, context);

    for (const key of [pagedKey, searchKey, roleKey]) expect(readList(key)).toEqual(before.get(key));
    expect(queryClient.getQueryState(meKeys.memberships)?.isInvalidated).toBe(true);
  });
});

describe('useMembershipsDeleteMutation', () => {
  type Context = [readonly unknown[], unknown][];
  const variablesFor = (...ids: string[]) => ({
    members: ids.map((id) => member(id)),
    query: { entityId: 'org-1', entityType: 'organization' as const },
    path: { tenantId: 'tenant-1', organizationId: 'org-1' },
    body: { ids: ids.map((id) => `m-${id}`) },
  });
  type Variables = ReturnType<typeof variablesFor>;
  const options = () => optionsOf<Options<void, Variables, Context>>(useMembershipsDeleteMutation);

  it('onMutate: drops the members from every list of the channel and lowers each total by the members it held', async () => {
    const before = seedMemberLists();

    const context = await options().onMutate(variablesFor('u2'));

    expect(listItems(readList(pagedKey))?.map((row) => row.id)).toEqual(['u1', 'u3']);
    expect(new Set(pageTotals(readList(pagedKey)))).toEqual(new Set([2]));
    expect(firstPageParam(readList(pagedKey))).toEqual({ page: 0, offset: 0 });
    expect(listItems(readList(roleKey))?.map((row) => row.id)).toEqual(['u1']);
    expect(readList(roleKey)).toMatchObject({ total: 1 });
    // A list that did not hold the deleted member keeps its total.
    expect(readList(searchKey)).toEqual({ items: [member('u1')], total: 1 });
    expect(readList(otherChannelKey)).toBe(before.get(otherChannelKey));

    expect(context).toHaveLength(3);
    for (const [key, previous] of context) expect(previous).toBe(before.get(key));
  });

  it('onMutate: a delete that empties a paged list leaves one empty first page', async () => {
    seedMemberLists();

    await options().onMutate(variablesFor('u1', 'u2', 'u3'));

    expect(readList(pagedKey)).toEqual({ pages: [{ items: [], total: 0 }], pageParams: [{ page: 0, offset: 0 }] });
  });

  it('onError: restores every list from the rollback entries', async () => {
    const before = seedMemberLists();
    const context = await options().onMutate(variablesFor('u1'));

    options().onError(new Error('rejected'), variablesFor('u1'), context);

    for (const key of [pagedKey, searchKey, roleKey]) expect(readList(key)).toEqual(before.get(key));
  });

  it('onSuccess: confirms with a toast', () => {
    options().onSuccess(undefined, variablesFor('u1'), []);

    expect(toaster.success).toHaveBeenCalledWith('c:success.delete_members');
  });
});
