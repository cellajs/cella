import '~/query/tests/query-client-env';
import '~/lib/dayjs';
import { QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { createElement, Fragment, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EllipsisOption } from '~/modules/common/data-table/table-ellipsis';

/** The options of the ellipsis cell rendered last. */
const seen = vi.hoisted(() => ({ options: [] as EllipsisOption<{ id: string }>[] }));

vi.mock('i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('i18next')>();
  const t = (key: string) => key;
  return { ...actual, t, default: { ...actual.default, t } };
});
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('~/modules/common/data-table/table-ellipsis', () => ({
  TableEllipsis: ({ options }: { options: EllipsisOption<{ id: string }>[] }) => {
    seen.options = options;
    return <span>{options.map(({ label }) => label).join('|')}</span>;
  },
}));

const { queryClient } = await import('~/query/query-client');
const { dateShort } = await import('~/utils/date-short');
const { useDropdowner } = await import('~/modules/common/dropdowner/use-dropdowner');
const { useSheeter } = await import('~/modules/common/sheeter/use-sheeter');
const { useUserStore } = await import('~/modules/user/user-store');
const users = await import('~/modules/user/table/users-columns');
const organizations = await import('~/modules/organization/table/organizations-columns');
const tenants = await import('~/modules/tenants/table/tenants-columns');
const requests = await import('~/modules/requests/table/requests-columns');
const members = await import('~/modules/memberships/members-table/members-columns');
const pending = await import('~/modules/memberships/pending-table/pending-columns');
const invitations = await import('~/modules/me/invitations-table/invitations-columns');
const attachments = await import('~/modules/attachment/table/attachments-columns');
const { exportToCsv } = await import('~/lib/export');

type Column = { key: string; renderCell?: (props: { row: never; tabIndex: number }) => ReactNode } & Record<
  string,
  unknown
>;

/** Runs a column hook inside a render and returns its columns. */
function columnsOf(useHook: () => unknown): Column[] {
  let result: unknown;
  function Probe() {
    result = useHook();
    return null;
  }
  renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  const [first] = result as [unknown];
  return (Array.isArray(first) ? first : result) as Column[];
}

const column = (columns: Column[], key: string) => {
  const found = columns.find((col) => col.key === key);
  if (!found) throw new Error(`no ${key} column`);
  return found;
};

/** The column without its renderer and export value, for comparing configuration. */
const configOf = ({ renderCell, exportValue, ...config }: Column) => config;

const cellMarkup = (col: Column, row: unknown) =>
  renderToStaticMarkup(createElement(Fragment, null, col.renderCell?.({ row: row as never, tabIndex: 0 })));

const created = '2026-05-04T10:00:00.000Z';
const seenAt = '2026-06-01T08:30:00.000Z';
const channel = {
  id: 'org-1',
  entityType: 'organization',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  can: { attachment: { delete: true } },
} as never;

const listedDate = {
  sortable: true,
  sortDescendingFirst: true,
  minBreakpoint: 'md',
  minWidth: 120,
  placeholderValue: '-',
};

afterEach(() => {
  seen.options = [];
  useSheeter.setState({ sheets: [] });
  vi.restoreAllMocks();
});

describe('date columns', () => {
  it.each([
    {
      name: 'users created',
      columns: () => columnsOf(users.useColumns),
      key: 'createdAt',
      config: { key: 'createdAt', name: 'c:created_at', ...listedDate },
      row: { createdAt: created },
      value: created,
    },
    {
      name: 'users last seen, ascending on the first sort',
      columns: () => columnsOf(users.useColumns),
      key: 'lastSeenAt',
      config: { key: 'lastSeenAt', name: 'c:last_seen_at', ...listedDate, sortDescendingFirst: undefined },
      row: { lastSeenAt: seenAt },
      value: seenAt,
    },
    {
      name: 'organizations created',
      columns: () => columnsOf(organizations.useColumns),
      key: 'createdAt',
      config: { key: 'createdAt', name: 'c:created_at', ...listedDate },
      row: { createdAt: created },
      value: created,
    },
    {
      name: 'tenants created',
      columns: () => columnsOf(tenants.useColumns),
      key: 'createdAt',
      config: { key: 'createdAt', name: 'c:created_at', ...listedDate },
      row: { createdAt: created },
      value: created,
    },
    {
      name: 'requests created',
      columns: () => columnsOf(requests.useColumns),
      key: 'createdAt',
      config: { key: 'createdAt', name: 'c:created_at', ...listedDate },
      row: { createdAt: created },
      value: created,
    },
    {
      name: 'members created, hidden in a sheet',
      columns: () => columnsOf(() => members.useColumns(true, true, 'organization')),
      key: 'createdAt',
      config: { key: 'createdAt', name: 'c:created_at', ...listedDate, hidden: true },
      row: { createdAt: created },
      value: created,
    },
    {
      name: 'members created, shown on a page',
      columns: () => columnsOf(() => members.useColumns(true, false, 'organization')),
      key: 'createdAt',
      config: { key: 'createdAt', name: 'c:created_at', ...listedDate, hidden: false },
      row: { createdAt: created },
      value: created,
    },
    {
      name: 'pending memberships invited',
      columns: () => columnsOf(() => pending.useColumns({ tenantId: 'tenant-1', organizationId: 'org-1' }, true)),
      key: 'createdAt',
      config: { key: 'createdAt', name: 'c:invited_at', ...listedDate },
      row: { createdAt: created },
      value: created,
    },
    {
      name: 'invitations invited, unsorted and nested',
      columns: () => columnsOf(invitations.useColumns),
      key: 'createdAt',
      config: {
        key: 'createdAt',
        name: 'c:invited_at',
        ...listedDate,
        sortable: undefined,
        sortDescendingFirst: undefined,
      },
      row: { inactiveMembership: { createdAt: created } },
      value: created,
    },
    {
      name: 'attachments created, hidden in a sheet',
      columns: () => columnsOf(() => attachments.useColumns(channel, true)),
      key: 'createdAt',
      config: { key: 'createdAt', name: 'c:created_at', ...listedDate, hidden: true },
      row: { createdAt: created },
      value: created,
    },
    {
      name: 'attachments created, shown on a page',
      columns: () => columnsOf(() => attachments.useColumns(channel, false)),
      key: 'createdAt',
      config: { key: 'createdAt', name: 'c:created_at', ...listedDate, hidden: false },
      row: { createdAt: created },
      value: created,
    },
  ])('$name', ({ columns, key, config, row, value }) => {
    const col = column(columns(), key);

    expect(configOf(col)).toEqual(config);
    expect(cellMarkup(col, row)).toBe(dateShort(value));
    expect(cellMarkup(col, { ...row, createdAt: null, lastSeenAt: null })).toBe(
      'inactiveMembership' in row ? dateShort(value) : '',
    );
  });
});

describe('ellipsis columns', () => {
  // Opening a sheet checks the focused element.
  beforeAll(() => {
    vi.stubGlobal('document', { activeElement: null });
    vi.stubGlobal('HTMLButtonElement', class {});
    vi.stubGlobal('HTMLAnchorElement', class {});
  });

  const rowAction = (label: string) => {
    const option = seen.options.find((candidate) => candidate.label === label);
    if (!option) throw new Error(`no ${label} option`);
    return option;
  };
  const trigger = { current: null };

  it.each([
    { name: 'users', columns: () => columnsOf(users.useColumns), sheet: 'update-user' },
    { name: 'organizations', columns: () => columnsOf(organizations.useColumns), sheet: 'update-organization' },
  ])('$name: edit opens the edit sheet, delete swaps in a confirmation', ({ columns, sheet }) => {
    const col = column(columns(), 'ellipsis');
    const row = { id: 'row-1', name: 'Row one', tenantId: 'tenant-1' };

    expect(configOf(col)).toEqual({ key: 'ellipsis', name: '', width: 32 });
    expect(cellMarkup(col, row)).toBe('<span>c:edit|c:delete</span>');

    const remove = vi.spyOn(useDropdowner.getState(), 'remove');
    rowAction('c:edit').onSelect(row, trigger);
    expect(remove).toHaveBeenCalled();
    expect(useSheeter.getState().sheets.map(({ id }) => id)).toEqual([sheet]);

    const update = vi.spyOn(useDropdowner.getState(), 'update');
    rowAction('c:delete').onSelect(row, trigger);
    const content = update.mock.calls[0][0].content as ReactElement<{ title: string }>;
    expect(content.props.title).toBe('c:delete_confirm.text');
  });

  it('tenants: edit only', () => {
    const col = column(columnsOf(tenants.useColumns), 'ellipsis');

    expect(configOf(col)).toEqual({ key: 'ellipsis', name: '', width: 32 });
    expect(cellMarkup(col, { id: 'tenant-1', name: 'One' })).toBe('<span>c:edit</span>');

    rowAction('c:edit').onSelect({ id: 'tenant-1' }, trigger);
    expect(useSheeter.getState().sheets.map(({ id }) => id)).toEqual(['update-tenant']);
  });

  it('attachments: delete only on small screens, with a cancel that closes the menu', () => {
    const col = column(
      columnsOf(() => attachments.useColumns(channel, false)),
      'ellipsis',
    );
    const row = { id: 'att-1', name: 'File', createdBy: null, organizationId: 'org-1' };

    expect(configOf(col)).toEqual({ key: 'ellipsis', name: '', width: 32, maxBreakpoint: 'sm' });
    expect(cellMarkup(col, row)).toBe('<span>c:delete</span>');

    const update = vi.spyOn(useDropdowner.getState(), 'update');
    rowAction('c:delete').onSelect(row, trigger);
    const content = update.mock.calls[0][0].content as ReactElement<{
      title: string;
      children: ReactElement<{ callback: unknown; onCancel: unknown }>;
    }>;
    expect(content.props.title).toBe('c:delete_confirm.text');
    expect(content.props.children.props.onCancel).toBe(useDropdowner.getState().remove);
    expect(content.props.children.props.callback).toBe(useDropdowner.getState().remove);
  });

  it('attachments: renders nothing without delete permission', () => {
    useUserStore.setState({ user: { id: 'me' } as never });
    const noDelete = { ...(channel as object), can: { attachment: { delete: false } } } as never;
    const col = column(
      columnsOf(() => attachments.useColumns(noDelete, false)),
      'ellipsis',
    );

    expect(cellMarkup(col, { id: 'att-1', createdBy: null })).toBe('');
    useUserStore.setState({ user: null });
  });
});

describe('csv export', () => {
  /** The lines of the CSV file an export of these columns and rows downloads. */
  async function csvLines(columns: Column[], rows: Record<string, unknown>[]) {
    let file: Blob | undefined;
    vi.stubGlobal('document', { activeElement: null, createElement: () => ({ click: () => {} }) });
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      file = blob as Blob;
      return 'blob:export';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    await exportToCsv(columns as never, rows, 'export.csv');
    return file ? (await file.text()).split('\n') : [];
  }

  // The export writes dates in the long localized format; with a comma in it, the cell is quoted.
  const dateCell = (value: string | number) => `"${dayjs.utc(value).local().format('lll')}"`;

  it('organizations: visible columns with names as text, the role, counts and dates, and a dash when missing', async () => {
    const rows = [
      {
        id: 'org-48',
        name: 'Tenant 48',
        createdAt: created,
        membership: { role: 'admin' },
        included: { counts: { membership: { admin: 2, member: 5 }, entities: { attachment: 0 } } },
      },
      { id: 'org-12', name: 'Organization 12', createdAt: null, membership: null, included: {} },
      // A row fetched for the export carries the caller's membership under `included`.
      { id: 'org-7', name: 'Seven', included: { membership: { role: 'member' } } },
    ];

    expect(await csvLines(columnsOf(organizations.useColumns), rows)).toEqual([
      'c:name,c:your_role,c:created_at,c:admin,c:member,c:attachment',
      `Tenant 48,admin,${dateCell(created)},2,5,0`,
      'Organization 12,-,-,-,-,-',
      'Seven,member,-,-,-,-',
    ]);
  });

  it('members: visible columns with the role, dates and per-member counts, and a dash when missing', async () => {
    const postedAt = Date.parse(seenAt);
    const rows = [
      {
        id: 'user-48',
        name: 'Tenant 48',
        email: 'ada@example.com',
        membership: { role: 'member' },
        createdAt: created,
        lastSeenAt: seenAt,
        counts: { memberships: {}, products: { attachment: 3 }, activity: { attachment: postedAt } },
      },
      { id: 'user-12', name: 'Organization 12', email: null, membership: null, createdAt: null, lastSeenAt: null },
    ];

    const columns = columnsOf(() => members.useColumns(true, false, 'organization'));
    expect(await csvLines(columns, rows)).toEqual([
      'c:name,c:email,c:role,c:created_at,c:last_seen_at,c:last_post,c:attachment',
      `Tenant 48,ada@example.com,member,${dateCell(created)},${dateCell(seenAt)},${dateCell(postedAt)},3`,
      'Organization 12,-,-,-,-,-,-',
    ]);
  });
});
