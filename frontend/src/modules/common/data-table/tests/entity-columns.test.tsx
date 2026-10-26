import '~/query/tests/query-client-env';
import '~/lib/dayjs';
import { QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { appConfig, hierarchy, isChannel } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMemberCountHidden } from '~/lib/entity-modules';

vi.mock('i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('i18next')>();
  const t = (key: string) => key;
  return { ...actual, t, default: { ...actual.default, t } };
});
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { queryClient } = await import('~/query/query-client');
const organizations = await import('~/modules/organization/table/organizations-columns');
const members = await import('~/modules/memberships/members-table/members-columns');
const { exportToCsv } = await import('~/lib/export');

type Column = { key: string; renderHeaderCell?: () => ReactNode } & Record<string, unknown>;

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

/** The markup of the column's own header, for a column that renders one. */
const headerMarkup = (col: Column) => renderToStaticMarkup(createElement(Fragment, null, col.renderHeaderCell?.()));

const created = '2026-05-04T10:00:00.000Z';
const seenAt = '2026-06-01T08:30:00.000Z';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('row actions column', () => {
  it('shows nothing in its header and names the column for assistive technology', () => {
    expect(headerMarkup(column(columnsOf(organizations.useColumns), 'ellipsis'))).toBe('<span class="sr-only">c:actions</span>');
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
    exportToCsv(columns as never, rows, 'export.csv');
    return file ? (await file.text()).split('\n') : [];
  }

  // The export writes dates in the long localized format; with a comma in it, the cell is quoted.
  const dateCell = (value: string | number) => `"${dayjs.utc(value).local().format('lll')}"`;

  // Count columns follow the hierarchy and the members config, so an app's own entities keep these tests valid.
  // Organizations show the last channel and the first product below them, as organizations-columns does.
  const orgDescendants = hierarchy.getOrderedDescendants('organization');
  const lastChannel = orgDescendants.filter((type) => isChannel(type)).at(-1);
  const firstProduct = orgDescendants.find((type) => !isChannel(type));
  const orgCountTypes = orgDescendants.filter((type) => type === lastChannel || type === firstProduct);
  // Members show the stat product types, then the sub-channels, minus the hidden ones.
  const statTypes: readonly string[] = appConfig.memberStatProductTypes;
  const memberCountTypes = [...statTypes, ...orgDescendants.filter((type) => isChannel(type) && type !== 'organization')].filter(
    (type) => !isMemberCountHidden(type),
  );
  const cells = (types: readonly string[], cell: (type: string) => string) => types.map(cell).join(',');

  it('organizations: visible columns with names as text, the role, counts and dates, and a dash when missing', async () => {
    // One count column per organization role, in the hierarchy's order; each role gets its own count.
    const orgRoles: readonly string[] = hierarchy.getRoles('organization');
    const roleCount = (role: string) => orgRoles.indexOf(role) + 2;
    const rows = [
      {
        id: 'org-48',
        name: 'Tenant 48',
        createdAt: created,
        membership: { role: 'admin' },
        included: {
          counts: {
            membership: Object.fromEntries(orgRoles.map((role) => [role, roleCount(role)])),
            entities: Object.fromEntries(orgCountTypes.map((type) => [type, 0])),
          },
        },
      },
      { id: 'org-12', name: 'Organization 12', createdAt: null, membership: null, included: {} },
      // A row fetched for the export carries the caller's membership under `included`.
      { id: 'org-7', name: 'Seven', included: { membership: { role: 'member' } } },
    ];

    expect(await csvLines(columnsOf(organizations.useColumns), rows)).toEqual([
      `c:name,c:your_role,c:created_at,${cells(orgRoles, (role) => `c:${role}`)},${cells(orgCountTypes, (type) => `c:${type}`)}`,
      `Tenant 48,admin,${dateCell(created)},${cells(orgRoles, (role) => String(roleCount(role)))},${cells(orgCountTypes, () => '0')}`,
      `Organization 12,-,-,${cells(orgRoles, () => '-')},${cells(orgCountTypes, () => '-')}`,
      `Seven,member,-,${cells(orgRoles, () => '-')},${cells(orgCountTypes, () => '-')}`,
    ]);
  });

  it('members: visible columns with the role, MFA setting, dates and per-member counts, and a dash when missing', async () => {
    const postedAt = Date.parse(seenAt);
    const rows = [
      {
        id: 'user-48',
        name: 'Tenant 48',
        email: 'ada@example.com',
        membership: { role: 'member' },
        mfaRequired: true,
        createdAt: created,
        lastSeenAt: seenAt,
        counts: { memberships: {}, products: Object.fromEntries(statTypes.map((type) => [type, 3])), activity: { [statTypes[0]]: postedAt } },
      },
      { id: 'user-12', name: 'Organization 12', email: null, membership: null, createdAt: null, lastSeenAt: null },
    ];

    const columns = columnsOf(() => members.useColumns(true, false, 'organization'));
    // Channel counts are absent from the row, so their cells are dashes.
    expect(await csvLines(columns, rows)).toEqual([
      `c:name,c:email,c:role,c:mfa_short,c:created_at,c:last_seen_at,c:last_post,${cells(memberCountTypes, (type) => `c:${type}`)}`,
      `Tenant 48,ada@example.com,member,c:mfa_on,${dateCell(created)},${dateCell(seenAt)},${dateCell(postedAt)},${cells(memberCountTypes, (type) => (statTypes.includes(type) ? '3' : '-'))}`,
      `Organization 12,-,-,-,-,-,-,${cells(memberCountTypes, () => '-')}`,
    ]);

    // The MFA column is the admins' alone
    const [memberHeader] = await csvLines(
      columnsOf(() => members.useColumns(false, false, 'organization')),
      rows,
    );
    expect(memberHeader).not.toContain('c:mfa_short');
  });
});
