import '~/query/tests/query-client-env';
import { hierarchy } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The organization's least privileged role, whatever the app calls it.
const memberRole = hierarchy.getLeastPrivilegedRole('organization');

// Every list endpoint answers an empty page; each case reads the request the factory sent.
vi.mock('sdk', async (importOriginal) => {
  const page = () => vi.fn(async () => ({ items: [], total: 0 }));
  return {
    ...(await importOriginal<typeof import('sdk')>()),
    getUsers: page(),
    getOrganizations: page(),
    getTenants: page(),
    getMembers: page(),
    getPendingMemberships: page(),
    getRequests: page(),
    getAttachments: page(),
  };
});

const sdk = await import('sdk');
const { usersListQueryOptions } = await import('~/modules/user/query');
const { organizationsListQueryOptions, fetchOrganizationsForExport } = await import('~/modules/organization/query');
const { tenantsListQueryOptions } = await import('~/modules/tenants/query');
const { membersListQueryOptions, pendingMembershipsQueryOptions, fetchMembersForExport } = await import('~/modules/memberships/query');
const { requestsListQueryOptions, fetchRequestsForExport } = await import('~/modules/requests/query');
const { attachmentsListQueryOptions } = await import('~/modules/attachment/query');
const { syncStaleTime } = await import('~/query/basic/sync-stale-config');

type PagedOptions = {
  queryKey: readonly unknown[];
  queryFn?: unknown;
  initialPageParam?: unknown;
  getNextPageParam?: unknown;
  refetchOnMount?: unknown;
  staleTime?: unknown;
  meta?: unknown;
};

const signal = new AbortController().signal;
const path = { tenantId: 'tenant-1', organizationId: 'org-1' };
const channel = { entityId: 'org-1', entityType: 'organization' as const, ...path };

/** Runs a factory's queryFn for the page starting at `offset`, the way react-query calls it. */
async function requestFor(options: PagedOptions, pageParam: { page: number; offset?: number }) {
  const queryFn = options.queryFn as (context: { pageParam: typeof pageParam; signal: AbortSignal }) => unknown;
  await queryFn({ pageParam, signal });
}

const cases: {
  name: string;
  options: () => PagedOptions;
  sdkCall: ReturnType<typeof vi.fn>;
  queryKey: readonly unknown[];
  request: Record<string, unknown>;
  extra?: Partial<PagedOptions>;
}[] = [
  {
    name: 'users with defaults',
    options: () => usersListQueryOptions({}),
    sdkCall: vi.mocked(sdk.getUsers),
    queryKey: ['user', 'list', { q: '', sort: 'createdAt', order: 'desc', role: undefined }],
    request: { query: { q: '', sort: 'createdAt', order: 'desc', role: undefined, limit: '100', offset: '100' } },
    extra: { refetchOnMount: true },
  },
  {
    name: 'users filtered',
    options: () => usersListQueryOptions({ q: 'ada', sort: 'name', order: 'asc', role: 'admin', limit: 10 }),
    sdkCall: vi.mocked(sdk.getUsers),
    queryKey: ['user', 'list', { q: 'ada', sort: 'name', order: 'asc', role: 'admin' }],
    request: { query: { q: 'ada', sort: 'name', order: 'asc', role: 'admin', limit: '10', offset: '100' } },
  },
  {
    name: 'organizations with defaults',
    options: () => organizationsListQueryOptions({}),
    sdkCall: vi.mocked(sdk.getOrganizations),
    queryKey: [
      'organization',
      'list',
      { q: '', sort: 'displayOrder', order: 'asc', relatableUserId: undefined, excludeArchived: undefined, role: undefined },
    ],
    request: {
      query: {
        q: '',
        sort: 'displayOrder',
        order: 'asc',
        relatableUserId: undefined,
        excludeArchived: undefined,
        role: undefined,
        include: undefined,
        limit: '40',
        offset: '100',
      },
    },
    extra: { refetchOnMount: true },
  },
  {
    name: 'organizations sorted by another column default to descending and keep include out of the key',
    options: () => organizationsListQueryOptions({ sort: 'name', relatableUserId: 'u1', excludeArchived: 'true', include: 'counts' }),
    sdkCall: vi.mocked(sdk.getOrganizations),
    queryKey: ['organization', 'list', { q: '', sort: 'name', order: 'desc', relatableUserId: 'u1', excludeArchived: 'true', role: undefined }],
    request: {
      query: {
        q: '',
        sort: 'name',
        order: 'desc',
        relatableUserId: 'u1',
        excludeArchived: 'true',
        role: undefined,
        include: 'counts',
        limit: '40',
        offset: '100',
      },
    },
  },
  {
    name: 'tenants page by the users limit',
    options: () => tenantsListQueryOptions({ status: 'active' }),
    sdkCall: vi.mocked(sdk.getTenants),
    queryKey: ['tenant', 'list', { q: '', status: 'active', sort: 'createdAt', order: 'desc' }],
    request: { query: { q: '', status: 'active', sort: 'createdAt', order: 'desc', limit: '100', offset: '100' } },
    extra: { refetchOnMount: true },
  },
  {
    name: 'members key the path ids and keep include out of the key',
    options: () => membersListQueryOptions({ ...channel, role: 'admin', include: 'counts' }),
    sdkCall: vi.mocked(sdk.getMembers),
    queryKey: [
      'member',
      'list',
      {
        entityId: 'org-1',
        entityType: 'organization',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        q: '',
        sort: 'lastSeenAt',
        order: 'desc',
        role: 'admin',
        userIds: undefined,
      },
    ],
    request: {
      query: {
        q: '',
        sort: 'lastSeenAt',
        order: 'desc',
        role: 'admin',
        userIds: undefined,
        include: 'counts',
        limit: '40',
        entityId: 'org-1',
        entityType: 'organization',
        offset: '100',
      },
      path,
    },
    extra: { refetchOnMount: true },
  },
  {
    name: 'pending memberships hardcode their defaults under an invites prefix',
    options: () => pendingMembershipsQueryOptions(channel),
    sdkCall: vi.mocked(sdk.getPendingMemberships),
    queryKey: [
      'invites',
      'member',
      'list',
      { entityId: 'org-1', entityType: 'organization', tenantId: 'tenant-1', organizationId: 'org-1', q: '', sort: 'createdAt', order: 'desc' },
    ],
    request: { query: { q: '', sort: 'createdAt', order: 'desc', limit: '20', entityId: 'org-1', entityType: 'organization', offset: '100' }, path },
    extra: { refetchOnMount: true },
  },
  {
    name: 'requests use their table entries key',
    options: () => requestsListQueryOptions({ q: 'mail' }),
    sdkCall: vi.mocked(sdk.getRequests),
    queryKey: ['requests', 'table', { q: 'mail', sort: 'createdAt', order: 'desc' }],
    request: { query: { q: 'mail', sort: 'createdAt', order: 'desc', limit: '40', offset: '100' } },
    extra: { refetchOnMount: true },
  },
  {
    name: 'attachments key the organization and stay out of the persisted cache',
    options: () => attachmentsListQueryOptions(path),
    sdkCall: vi.mocked(sdk.getAttachments),
    queryKey: ['attachment', 'list', 'org-1', { q: '', sort: 'createdAt', order: 'desc' }],
    request: { query: { q: '', sort: 'createdAt', order: 'desc', limit: '40', offset: '100' }, path },
    extra: { refetchOnMount: undefined, meta: { persist: false }, staleTime: syncStaleTime },
  },
];

afterEach(() => vi.clearAllMocks());

describe('list query factories', () => {
  it.each(cases)('$name', async ({ options, sdkCall, queryKey, request, extra = {} }) => {
    const built = options();

    expect(built.queryKey).toEqual(queryKey);
    expect(built.initialPageParam).toEqual({ page: 0, offset: 0 });
    expect(built.getNextPageParam).toBeTypeOf('function');
    for (const [option, value] of Object.entries(extra)) expect(built[option as keyof PagedOptions]).toEqual(value);

    await requestFor(built, { page: 1, offset: 100 });

    expect(sdkCall).toHaveBeenCalledTimes(1);
    expect(sdkCall).toHaveBeenCalledWith({ ...request, signal });
  });

  it('falls back to page times limit when a page param has no offset', async () => {
    await requestFor(usersListQueryOptions({ limit: 25 }), { page: 3 });

    expect(vi.mocked(sdk.getUsers).mock.calls[0][0]).toMatchObject({ query: { limit: '25', offset: '75' } });
  });
});

describe('export fetchers', () => {
  it('organizations: order follows displayOrder and the rows include counts and my membership', async () => {
    await fetchOrganizationsForExport({ limit: 1000, offset: 2000 });

    expect(sdk.getOrganizations).toHaveBeenCalledWith({
      query: { limit: '1000', q: '', sort: 'displayOrder', order: 'asc', offset: '2000', include: 'counts,membership' },
    });
  });

  it('organizations: another sort defaults to descending', async () => {
    await fetchOrganizationsForExport({ limit: 1000, q: 'x', sort: 'name' });

    expect(sdk.getOrganizations).toHaveBeenCalledWith({
      query: { limit: '1000', q: 'x', sort: 'name', order: 'desc', offset: '0', include: 'counts,membership' },
    });
  });

  it('requests: search defaults fill the query', async () => {
    await fetchRequestsForExport({ limit: 1000 });

    expect(sdk.getRequests).toHaveBeenCalledWith({ query: { q: '', sort: 'createdAt', order: 'desc', limit: '1000', offset: '0' } });
  });

  it('members: the channel scopes the request, search defaults fill it and the rows include counts', async () => {
    await fetchMembersForExport({ ...channel, role: memberRole, limit: 1000, offset: 1000 });

    expect(sdk.getMembers).toHaveBeenCalledWith({
      query: {
        q: undefined,
        sort: 'lastSeenAt',
        order: 'desc',
        role: memberRole,
        limit: '1000',
        offset: '1000',
        entityId: 'org-1',
        entityType: 'organization',
        include: 'counts',
      },
      path,
    });
  });

  it('returns the items of the page', async () => {
    vi.mocked(sdk.getRequests).mockResolvedValueOnce({ items: [{ id: 'r1' }], total: 1 } as never);

    await expect(fetchRequestsForExport({ limit: 1000 })).resolves.toEqual([{ id: 'r1' }]);
  });
});
