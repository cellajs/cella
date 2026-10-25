import '~/query/tests/query-client-env';
import type { MembershipBase } from 'sdk';
import { hierarchy } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '~/modules/memberships/types';

// The organization's least privileged role, whatever the app calls it.
const memberRole = hierarchy.getLeastPrivilegedRole('organization');

// The hooks return their options, so each lifecycle callback runs without rendering.
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useMutation: (options: unknown) => options,
}));
vi.mock('i18next', async (importOriginal) => ({ ...(await importOriginal<typeof import('i18next')>()), t: (key: string) => key }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const { queryClient } = await import('~/query/query-client');
const { membersListQueryOptions } = await import('~/modules/memberships/query');
const { useMembershipsDeleteMutation } = await import('~/modules/memberships/query-mutations');

type Options<TVariables, TContext> = { onMutate: (variables: TVariables) => Promise<TContext> };

/** The mocked useMutation hands back its options, which the hook's return type does not describe. */
const optionsOf = <TOptions>(useHook: () => unknown) => useHook() as TOptions;

const membership = (id: string, overrides: Partial<MembershipBase> = {}) =>
  ({
    id,
    tenantId: 'tenant-1',
    userId: 'me',
    channelType: 'organization',
    channelId: `channel-${id}`,
    role: memberRole,
    ...overrides,
  }) as MembershipBase;

afterEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

const scope = { entityId: 'org-1', entityType: 'organization', tenantId: 'tenant-1', organizationId: 'org-1' } as const;
// Members lists are paged in the app; the untagged copies also seed flat lists, which the writes handle too.
const pagedKey = [...membersListQueryOptions(scope).queryKey];
const searchKey = [...membersListQueryOptions({ ...scope, q: 'ada' }).queryKey];
const roleKey = [...membersListQueryOptions({ ...scope, role: memberRole }).queryKey];
const otherChannelKey = [...membersListQueryOptions({ ...scope, entityId: 'org-2' }).queryKey];

const member = (id: string, role: MembershipBase['role'] = memberRole) =>
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
  return new Map<readonly unknown[], MemberList | undefined>([pagedKey, searchKey, roleKey, otherChannelKey].map((key) => [key, readList(key)]));
}

describe('useMembershipsDeleteMutation', () => {
  type Context = [readonly unknown[], unknown][];
  const variablesFor = (...ids: string[]) => ({
    members: ids.map((id) => member(id)),
    query: { entityId: 'org-1', entityType: 'organization' as const },
    path: { tenantId: 'tenant-1', organizationId: 'org-1' },
    body: { ids: ids.map((id) => `m-${id}`) },
  });
  type Variables = ReturnType<typeof variablesFor>;
  const options = () => optionsOf<Options<Variables, Context>>(useMembershipsDeleteMutation);

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
});
