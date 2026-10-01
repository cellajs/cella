// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { act, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; name: string };
type TableProps = {
  rows?: Row[];
  fetchMore?: () => Promise<void>;
  hasNextPage?: boolean;
  isFetching?: boolean;
  isFiltered?: boolean;
  selectedRows?: Set<string>;
  onSelectedRowsChange?: (ids: Set<string>) => void;
};
type BarProps = { selected?: Row[]; clearSelection?: () => void };

/** Props of every render of the data table and the bar, newest last. */
const seen = vi.hoisted(() => ({ table: [] as unknown[], bar: [] as unknown[], search: {} as Record<string, unknown> }));

/** Bumping `version` renames every row on the next fetch; while `hold` is pending, fetches wait for it. */
const server = vi.hoisted(() => ({ version: 0, hold: undefined as Promise<void> | undefined }));

// Five rows served two per page, so a table needs three pages to hold them all.
const pagedFetch = vi.hoisted(() =>
  vi.fn(async ({ query }: { query?: { offset?: string } }) => {
    if (server.hold) await server.hold;
    const all = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, name: `row ${i} v${server.version}` }));
    const offset = Number(query?.offset ?? 0);
    return { items: all.slice(offset, offset + 2), total: all.length };
  }),
);

vi.mock('sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sdk')>()),
  getUsers: pagedFetch,
  getOrganizations: pagedFetch,
  getTenants: pagedFetch,
  getRequests: pagedFetch,
  getMembers: pagedFetch,
  getPendingMemberships: pagedFetch,
  getAttachments: pagedFetch,
}));
// The app client module writes HMR state on load, which this environment does not provide; the defaults match the app's.
vi.mock('~/query/query-client', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  const queries = { networkMode: 'offlineFirst', refetchOnMount: false, retry: false } as const;
  return { queryClient: new QueryClient({ defaultOptions: { queries } }) };
});
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('~/hooks/use-search-params', () => ({ useSearchParams: () => ({ search: seen.search, setSearch: vi.fn() }) }));
vi.mock('~/hooks/use-route-context', () => ({
  useOrganizationLayoutContext: () => ({ organization: { id: 'org-1', tenantId: 'tenant-1' } }),
}));
vi.mock('~/modules/common/data-table/data-table', () => ({
  DataTable: (props: unknown) => {
    seen.table.push(props);
    return null;
  },
}));

const captureBar = (props: unknown) => {
  seen.bar.push(props);
  return null;
};
vi.mock('~/modules/user/table/users-bar', () => ({ UsersTableBar: captureBar }));
vi.mock('~/modules/user/table/users-columns', () => ({ useColumns: () => [[], vi.fn()] }));
vi.mock('~/modules/organization/table/organizations-bar', () => ({ OrganizationsTableBar: captureBar }));
vi.mock('~/modules/organization/table/organizations-columns', () => ({ useColumns: () => [[], vi.fn()] }));
vi.mock('~/modules/tenants/table/tenants-bar', () => ({ TenantsTableBar: captureBar }));
vi.mock('~/modules/tenants/table/tenants-columns', () => ({ useColumns: () => [[], vi.fn()] }));
vi.mock('~/modules/requests/table/requests-bar', () => ({ RequestsTableBar: captureBar }));
vi.mock('~/modules/requests/table/requests-columns', () => ({ useColumns: () => [[], vi.fn()] }));
vi.mock('~/modules/memberships/members-table/members-bar', () => ({ MembersTableBar: captureBar }));
vi.mock('~/modules/memberships/members-table/members-columns', () => ({ useColumns: () => [[], vi.fn()] }));
vi.mock('~/modules/memberships/pending-table/pending-bar', () => ({ PendingMembershipsTableBar: captureBar }));
vi.mock('~/modules/memberships/pending-table/pending-columns', () => ({ useColumns: () => [[], vi.fn()] }));
vi.mock('~/modules/attachment/table/attachments-bar', () => ({ AttachmentsTableBar: captureBar }));
vi.mock('~/modules/attachment/table/attachments-columns', () => ({ useColumns: () => [] }));

const { queryClient } = await import('~/query/query-client');
const { UsersTable } = await import('~/modules/user/table/users-table');
const { OrganizationsTable } = await import('~/modules/organization/table/organizations-table');
const { TenantsTable } = await import('~/modules/tenants/table/tenants-table');
const { RequestsTable } = await import('~/modules/requests/table/requests-table');
const { MembersTable } = await import('~/modules/memberships/members-table/members-table');
const { PendingMembershipsTable } = await import('~/modules/memberships/pending-table/pending-memberships-table');
const { AttachmentsTable } = await import('~/modules/attachment/table/attachments-table');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const channel = { id: 'org-1', entityType: 'organization', tenantId: 'tenant-1', organizationId: 'org-1', can: {} };
const lastTable = () => seen.table.at(-1) as TableProps;
const lastBar = () => seen.bar.at(-1) as BarProps;
const ids = (rows?: Row[]) => rows?.map((row) => row.id);

let root: Root | undefined;

async function render(Table: ComponentType<Record<string, unknown>>, props: Record<string, unknown> = {}) {
  root = createRoot(document.createElement('div'));
  await act(async () =>
    root?.render(
      <QueryClientProvider client={queryClient}>
        <Table {...props} />
      </QueryClientProvider>,
    ),
  );
  await vi.waitFor(() => expect(lastTable().rows).toBeDefined());
}

afterEach(async () => {
  await act(async () => root?.unmount());
  queryClient.clear();
  seen.table.length = 0;
  seen.bar.length = 0;
  seen.search = {};
  server.version = 0;
  server.hold = undefined;
  pagedFetch.mockClear();
});

const pagedTables: { name: string; Table: ComponentType<never>; props?: Record<string, unknown> }[] = [
  { name: 'users', Table: UsersTable },
  { name: 'organizations', Table: OrganizationsTable },
  { name: 'tenants', Table: TenantsTable },
  { name: 'requests', Table: RequestsTable },
  { name: 'members', Table: MembersTable, props: { channel } },
  { name: 'pending memberships', Table: PendingMembershipsTable, props: { channel } },
];

describe.each(pagedTables)('$name table paging', ({ Table, props }) => {
  const Rendered = Table as ComponentType<Record<string, unknown>>;

  it('flattens the loaded pages into rows and fetches the next page on demand', async () => {
    await render(Rendered, props);
    expect(ids(lastTable().rows)).toEqual(['r0', 'r1']);
    expect(lastTable().hasNextPage).toBe(true);

    await act(async () => lastTable().fetchMore?.());
    await vi.waitFor(() => expect(ids(lastTable().rows)).toEqual(['r0', 'r1', 'r2', 'r3']));
    expect(pagedFetch).toHaveBeenLastCalledWith(expect.objectContaining({ query: expect.objectContaining({ offset: '2' }) }));
  });

  it('ignores fetchMore while a page is loading and once every page is in', async () => {
    await render(Rendered, props);

    let release = () => {};
    server.hold = new Promise((resolve) => {
      release = resolve;
    });
    await act(async () => void lastTable().fetchMore?.());
    await vi.waitFor(() => expect(lastTable().isFetching).toBe(true));
    await act(async () => void lastTable().fetchMore?.());
    expect(pagedFetch).toHaveBeenCalledTimes(2);

    server.hold = undefined;
    release();
    await vi.waitFor(() => expect(lastTable().isFetching).toBe(false));
    expect(pagedFetch).toHaveBeenCalledTimes(2);

    await act(async () => lastTable().fetchMore?.());
    await vi.waitFor(() => expect(lastTable().hasNextPage).toBe(false));
    const calls = pagedFetch.mock.calls.length;
    await act(async () => lastTable().fetchMore?.());
    expect(pagedFetch).toHaveBeenCalledTimes(calls);
  });

  it('hands the data table a new fetchMore on every render', async () => {
    await render(Rendered, props);
    const renders = seen.table.length;

    await act(async () => lastTable().fetchMore?.());
    await vi.waitFor(() => expect(seen.table.length).toBeGreaterThan(renders));

    const [previous, current] = seen.table.slice(-2) as TableProps[];
    expect(current.fetchMore).not.toBe(previous.fetchMore);
  });
});

const selectingTables: { name: string; Table: ComponentType<never>; props?: Record<string, unknown> }[] = [
  { name: 'users', Table: UsersTable },
  { name: 'organizations', Table: OrganizationsTable },
  { name: 'requests', Table: RequestsTable },
  { name: 'members', Table: MembersTable, props: { channel } },
  { name: 'attachments', Table: AttachmentsTable, props: { channel } },
];

describe.each(selectingTables)('$name table selection', ({ Table, props }) => {
  const Rendered = Table as ComponentType<Record<string, unknown>>;

  it('keeps snapshots of the selected rows, drops unknown ids and clears', async () => {
    await render(Rendered, props);
    const rows = lastTable().rows ?? [];

    await act(async () => lastTable().onSelectedRowsChange?.(new Set(['r1', 'missing'])));
    expect(lastBar().selected).toEqual([rows[1]]);
    expect(lastBar().selected?.[0]).toBe(rows[1]);
    expect(lastTable().selectedRows).toEqual(new Set(['r1']));

    // A refetch replaces the row; the selection keeps the object it was picked from.
    server.version = 1;
    await act(async () => {
      for (const [key] of queryClient.getQueriesData({})) queryClient.invalidateQueries({ queryKey: key });
    });
    await vi.waitFor(() => expect(lastTable().rows?.[1]).not.toBe(rows[1]));
    expect(lastBar().selected?.[0]).toBe(rows[1]);

    await act(async () => lastBar().clearSelection?.());
    expect(lastBar().selected).toEqual([]);
    expect(lastTable().selectedRows).toEqual(new Set());
  });
});

describe('filtered state', () => {
  it.each([
    { name: 'users by role', Table: UsersTable, search: { role: 'admin' }, filtered: true },
    { name: 'users by search', Table: UsersTable, search: { q: 'ada' }, filtered: true },
    { name: 'users unfiltered', Table: UsersTable, search: {}, filtered: false },
    { name: 'members by role', Table: MembersTable, search: { role: 'member' }, filtered: true, props: { channel } },
    { name: 'organizations by search', Table: OrganizationsTable, search: { q: 'x' }, filtered: true },
    { name: 'organizations ignore role', Table: OrganizationsTable, search: { role: 'admin' }, filtered: false },
  ] as { name: string; Table: ComponentType<never>; search: Record<string, unknown>; filtered: boolean; props?: Record<string, unknown> }[])(
    '$name',
    async ({ Table, search, filtered, props }) => {
      seen.search = search;
      await render(Table as ComponentType<Record<string, unknown>>, props);
      expect(lastTable().isFiltered).toBe(filtered);
    },
  );
});
