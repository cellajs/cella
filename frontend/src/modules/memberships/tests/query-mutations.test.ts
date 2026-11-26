import '~/query/tests/query-client-env';
import type { MembershipBase } from 'sdk';
import { hierarchy } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '~/modules/memberships/types';

// A plain member's organization role, the default one, whatever the app calls it.
const memberRole = hierarchy.getDefaultRole('organization');

// The hooks return their options, so each lifecycle callback runs without rendering.
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useMutation: (options: unknown) => options,
}));
vi.mock('i18next', async (importOriginal) => ({ ...(await importOriginal<typeof import('i18next')>()), t: (key: string) => key }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const { queryClient } = await import('~/query/query-client');
const { membersListQueryOptions } = await import('~/modules/memberships/query');
const { useMemberUpdateMutation, useMembershipsDeleteMutation } = await import('~/modules/memberships/query-mutations');
const { meKeys } = await import('~/modules/me/query');
// Registers the organization keys that a membership write invalidates.
await import('~/modules/organization/query');

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

const scope = { channelId: 'org-1', channelType: 'organization', tenantId: 'tenant-1', organizationId: 'org-1' } as const;
// Members lists are paged in the app; the untagged copies also seed flat lists, which the writes handle too.
const pagedKey = [...membersListQueryOptions(scope).queryKey];
const searchKey = [...membersListQueryOptions({ ...scope, q: 'ada' }).queryKey];
const roleKey = [...membersListQueryOptions({ ...scope, role: memberRole }).queryKey];
const otherChannelKey = [...membersListQueryOptions({ ...scope, channelId: 'org-2' }).queryKey];

const member = (id: string, role: MembershipBase['role'] = memberRole) =>
  ({ id, name: id, membership: membership(`m-${id}`, { userId: id, channelId: 'org-1', role }) }) as Member;

type MemberList = { results: Member[]; totalSize: number } | { pages: { results: Member[]; totalSize: number }[]; pageParams: unknown[] };
const readList = (key: readonly unknown[]) => queryClient.getQueryData<MemberList>(key);
const listItems = (data?: MemberList) => (data && 'pages' in data ? data.pages.flatMap((page) => page.results) : data?.results);
const pageTotals = (data?: MemberList) => (data && 'pages' in data ? data.pages.map((page) => page.totalSize) : []);
const firstPageParam = (data?: MemberList) => (data && 'pages' in data ? data.pageParams[0] : undefined);

/** A paged list over two pages, a flat search list, a role-filtered list and another channel's list. */
function seedMemberLists() {
  queryClient.setQueryData(pagedKey, {
    pages: [
      { results: [member('u1'), member('u2')], totalSize: 3 },
      { results: [member('u3')], totalSize: 3 },
    ],
    pageParams: ['', 'token-1'],
  });
  queryClient.setQueryData(searchKey, { results: [member('u1')], totalSize: 1 });
  queryClient.setQueryData(roleKey, { results: [member('u1'), member('u2')], totalSize: 2 });
  queryClient.setQueryData(otherChannelKey, { results: [member('u1')], totalSize: 1 });
  return new Map<readonly unknown[], MemberList | undefined>([pagedKey, searchKey, roleKey, otherChannelKey].map((key) => [key, readList(key)]));
}

describe('useMembershipsDeleteMutation', () => {
  type Context = [readonly unknown[], unknown][];
  const variablesFor = (...ids: string[]) => ({
    members: ids.map((id) => member(id)),
    query: { channelId: 'org-1', channelType: 'organization' as const },
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
    expect(firstPageParam(readList(pagedKey))).toEqual('');
    expect(listItems(readList(roleKey))?.map((row) => row.id)).toEqual(['u1']);
    expect(readList(roleKey)).toMatchObject({ totalSize: 1 });
    // A list that did not hold the deleted member keeps its total.
    expect(readList(searchKey)).toEqual({ results: [member('u1')], totalSize: 1 });
    expect(readList(otherChannelKey)).toBe(before.get(otherChannelKey));

    expect(context).toHaveLength(3);
    for (const [key, previous] of context) expect(previous).toBe(before.get(key));
  });
});

describe('useMemberUpdateMutation', () => {
  type Memberships = { results: MembershipBase[]; totalSize: number };
  const memberships = (hidden: boolean): Memberships => ({ results: [membership('m-1', { hidden, displayOrder: 1 })], totalSize: 1 });
  const variables = {
    path: { tenantId: 'tenant-1', organizationId: 'org-1', membershipId: 'm-1' },
    body: { hidden: true },
    channelId: 'channel-m-1',
    channelType: 'organization' as const,
  };
  type Context = { previousLists: unknown[]; toastMessage: string };
  type UpdateOptions = Options<typeof variables, Context> & {
    onSuccess: (data: MembershipBase, vars: typeof variables, context: Context) => Promise<void>;
  };
  const options = () => optionsOf<UpdateOptions>(useMemberUpdateMutation);

  it('onSuccess: a memberships read that started before a hide and lands after it keeps the hide, also for a caller awaiting it', async () => {
    queryClient.setQueryData(meKeys.memberships, memberships(false));
    // The first read answers with what the server held before the write, and lands only after the write's answer.
    let landStaleRead: (data: Memberships) => void = () => {};
    let reads = 0;
    const queryFn = () => (++reads === 1 ? new Promise<Memberships>((resolve) => (landStaleRead = resolve)) : Promise.resolve(memberships(true)));
    // Catchup awaits a memberships read the same way.
    const awaited = queryClient.query({ queryKey: meKeys.memberships, queryFn, staleTime: 0 });

    const context = await options().onMutate(variables);
    await options().onSuccess(membership('m-1', { hidden: true, displayOrder: 1 }), variables, context);
    landStaleRead(memberships(false));

    expect((await awaited).results[0].hidden).toBe(true);
    expect(queryClient.getQueryData<Memberships>(meKeys.memberships)?.results[0].hidden).toBe(true);
  });
});
