import type { Meta, StoryObj } from '@storybook/react-vite';
import i18n from 'i18next';
import type { ReactNode } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { AttachmentsTableBar } from '~/modules/attachment/table/attachments-bar';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import type { EnrichedChannel } from '~/modules/entities/types';
import { MembersTableBar } from '~/modules/memberships/members-table/members-bar';
import { OrganizationsTableBar } from '~/modules/organization/table/organizations-bar';
import { PagesTableBar } from '~/modules/page/table/pages-bar';
import { RequestsTableBar } from '~/modules/requests/table/requests-bar';
import { TenantsTableBar } from '~/modules/tenants/table/tenants-bar';
import { UsersTableBar } from '~/modules/user/table/users-bar';
import { withApp } from '~/stories/with-app';

// Bars read their count from this cached list; the rows are stand-ins, the bars read only ids and a few fields.
const listKey = ['story', 'list'];
const rows = [
  { id: 'r1', name: 'One', email: 'one@example.com', type: 'waitlist', wasInvited: false, createdBy: null },
  { id: 'r2', name: 'Two', email: 'two@example.com', type: 'waitlist', wasInvited: true, createdBy: null },
];
// A stand-in channel with the fields the bars read; the cast skips the rest of the enriched row.
const channel = {
  id: 'org-1',
  entityType: 'organization',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  can: { attachment: { delete: true } },
} as unknown as EnrichedChannel;

type BarArgs = {
  q?: string;
  role?: string;
  selected?: typeof rows;
  isSheet?: boolean;
  canUpdate?: boolean;
  setSearch: (values: Record<string, unknown>) => void;
  clearSelection: () => void;
  bar: 'users' | 'organizations' | 'tenants' | 'requests' | 'members' | 'attachments' | 'pages';
};

// The view menu opens through the dropdowner, which the story mounts beside the bar
function Bar(args: BarArgs) {
  return (
    <>
      <Dropdowner />
      <BarFor {...args} />
    </>
  );
}

function BarFor({ bar, q, role, selected = [], isSheet, canUpdate = true, setSearch, clearSelection }: BarArgs): ReactNode {
  // The bars take generated row types; the stand-in rows carry only what the bars read.
  const common = {
    queryKey: listKey,
    columns: [],
    setColumns: () => {},
    setSearch,
    clearSelection,
    selected: selected as never[],
  };
  const searchVars = { q, role, limit: 20 } as never;

  if (bar === 'users') return <UsersTableBar {...common} searchVars={searchVars} />;
  if (bar === 'organizations') return <OrganizationsTableBar {...common} searchVars={searchVars} />;
  if (bar === 'tenants') return <TenantsTableBar {...common} searchVars={searchVars} />;
  if (bar === 'requests') return <RequestsTableBar {...common} searchVars={searchVars} />;
  if (bar === 'members') return <MembersTableBar {...common} searchVars={searchVars} channel={channel} isSheet={isSheet} canUpdate={canUpdate} />;
  if (bar === 'attachments') return <AttachmentsTableBar {...common} searchVars={searchVars} channel={channel} isSheet={isSheet} canUpload />;
  return <PagesTableBar total={2} searchVars={{ q }} setSearch={setSearch} columns={[]} setColumns={() => {}} />;
}

/** The bar above each entity table: count, search, reset, actions, the view menu, focus view and the selection bar. */
const meta = {
  title: 'common/data-table/TableBarShell',
  component: Bar,
  decorators: [withApp],
  beforeEach: () => {
    // Story tests run without the app's translations; the counts read through these two
    i18n.addResourceBundle('en', 'c', { resource_count: '{{count}} {{resource, lowercase}}' }, true, true);
    return () => i18n.removeResourceBundle('en', 'c');
  },
  parameters: { app: { queryData: [[listKey, { items: rows, total: 2 }]] } },
  args: { setSearch: fn(), clearSelection: fn(), bar: 'users' },
} satisfies Meta<typeof Bar>;

export default meta;
type Story = StoryObj<typeof meta>;

const body = () => within(document.body);
const searchInput = (canvasElement: HTMLElement, name: string) => canvasElement.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
const hasIcon = (element: HTMLElement, icon: string) => !!element.querySelector(`.lucide-${icon}`);

/** Resets through the field's clear button. */
async function expectReset(canvasElement: HTMLElement, args: BarArgs, reset: Record<string, unknown>) {
  await userEvent.click(within(canvasElement).getByRole('button', { name: 'clear_search' }));
  await expect(args.setSearch).toHaveBeenCalledWith(reset);
}

export const UsersFiltered: Story = {
  args: { bar: 'users', q: 'ada', role: 'admin', selected: rows },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(searchInput(canvasElement, 'userSearch')).not.toBeNull();
    await expect(canvas.queryByRole('button', { name: 'invite' })).toBeNull();
    await expect(hasIcon(canvasElement, 'sliders-horizontal')).toBe(false);
    await expect(hasIcon(canvasElement, 'expand')).toBe(true);
    await expect(await body().findByRole('button', { name: 'delete' })).toBeInTheDocument();
    // The embedded invite dialog mounts into an empty container right after the bar.
    await expect(canvasElement.querySelector('div.empty\\:hidden')).not.toBeNull();

    await expectReset(canvasElement, args, { q: '', role: undefined });
    await expect(args.clearSelection).toHaveBeenCalled();
  },
};

export const UsersSearch: Story = {
  args: { bar: 'users' },
  play: async ({ canvasElement, args }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'invite' })).toBeInTheDocument();

    const input = searchInput(canvasElement, 'userSearch');
    if (!input) throw new Error('no search input');
    await userEvent.type(input, 'ada');
    await waitFor(() => expect(args.setSearch).toHaveBeenCalledWith({ q: 'ada' }));
    const clear = args.clearSelection as ReturnType<typeof fn>;
    const search = args.setSearch as ReturnType<typeof fn>;
    await expect(clear.mock.invocationCallOrder[0]).toBeLessThan(search.mock.invocationCallOrder[0]);
  },
};

export const OrganizationsExport: Story = {
  args: { bar: 'organizations', selected: rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(searchInput(canvasElement, 'organizationSearch')).not.toBeNull();
    await expect(canvas.getByRole('button', { name: 'create' })).toBeInTheDocument();
    await expect(await body().findByRole('button', { name: 'newsletter' })).toBeInTheDocument();

    await userEvent.click(canvasElement.querySelector('.lucide-sliders-horizontal')?.closest('button') as HTMLElement);
    const menu = await body().findByRole('menu');
    // Full export and selected-rows export; a bar without named columns has no columns section.
    await expect(within(menu).getAllByRole('menuitem')).toHaveLength(4);
    await expect(within(menu).getAllByText('2 selected')).toHaveLength(2);
    await userEvent.keyboard('{Escape}');
  },
};

export const OrganizationsFiltered: Story = {
  args: { bar: 'organizations', q: 'x' },
  play: async ({ canvasElement, args }) => {
    await expect(within(canvasElement).queryByRole('button', { name: 'create' })).toBeNull();
    await expectReset(canvasElement, args, { q: '' });
    await expect(args.clearSelection).toHaveBeenCalled();
  },
};

export const RequestsExport: Story = {
  args: { bar: 'requests', selected: rows },
  play: async ({ canvasElement }) => {
    await expect(searchInput(canvasElement, 'requestSearch')).not.toBeNull();
    // Only the first row still waits for an invite, so the invite action shows a badge of one.
    await expect(await body().findByRole('button', { name: /invite/ })).toBeInTheDocument();
    await expect(body().getByRole('button', { name: 'delete' })).toBeInTheDocument();

    await userEvent.click(canvasElement.querySelector('.lucide-sliders-horizontal')?.closest('button') as HTMLElement);
    const menu = await body().findByRole('menu');
    await expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
    await expect(within(menu).queryByText('2 selected')).toBeNull();
    await userEvent.keyboard('{Escape}');
  },
};

export const MembersPage: Story = {
  args: { bar: 'members', selected: rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(searchInput(canvasElement, 'memberSearch')).not.toBeNull();
    await expect(canvas.getByRole('button', { name: 'invite' })).toBeInTheDocument();
    await expect(hasIcon(canvasElement, 'sliders-horizontal')).toBe(true);
    await expect(hasIcon(canvasElement, 'expand')).toBe(true);
    await expect(await body().findByRole('button', { name: 'remove' })).toBeInTheDocument();
    await expect(canvasElement.querySelector('div.empty\\:hidden')).not.toBeNull();
  },
};

export const MembersSheet: Story = {
  args: { bar: 'members', isSheet: true },
  play: async ({ canvasElement }) => {
    await expect(hasIcon(canvasElement, 'sliders-horizontal')).toBe(false);
    await expect(hasIcon(canvasElement, 'expand')).toBe(false);
  },
};

export const MembersReadOnly: Story = {
  args: { bar: 'members', canUpdate: false, q: 'x' },
  play: async ({ canvasElement, args }) => {
    await expect(within(canvasElement).queryByRole('button', { name: 'invite' })).toBeNull();
    await expect(hasIcon(canvasElement, 'sliders-horizontal')).toBe(false);
    await expectReset(canvasElement, args, { q: '', role: undefined });
  },
};

export const AttachmentsSheet: Story = {
  args: { bar: 'attachments', isSheet: true, selected: rows },
  play: async ({ canvasElement }) => {
    await expect(searchInput(canvasElement, 'attachmentSearch')).not.toBeNull();
    await expect(within(canvasElement).getByRole('button', { name: 'upload' })).toBeInTheDocument();
    await expect(hasIcon(canvasElement, 'expand')).toBe(false);
    await expect(hasIcon(canvasElement, 'sliders-horizontal')).toBe(false);
    await expect(await body().findByRole('button', { name: 'delete' })).toBeInTheDocument();
    // With rows in the list the edit hint shows below the bar.
    await expect(await within(canvasElement).findByText('edit_attachment.text')).toBeVisible();
  },
};

export const AttachmentsFiltered: Story = {
  args: { bar: 'attachments', q: 'x' },
  play: async ({ canvasElement, args }) => {
    await expect(within(canvasElement).queryByRole('button', { name: 'upload' })).toBeNull();
    await expect(hasIcon(canvasElement, 'expand')).toBe(true);
    await expectReset(canvasElement, args, { q: '' });
  },
};

export const Tenants: Story = {
  args: { bar: 'tenants', q: 'x' },
  play: async ({ canvasElement, args }) => {
    await expect(searchInput(canvasElement, 'tenantSearch')).not.toBeNull();
    await expectReset(canvasElement, args, { q: '' });
    await expect(args.clearSelection).not.toHaveBeenCalled();
  },
};

export const Pages: Story = {
  args: { bar: 'pages', q: 'x' },
  play: async ({ canvasElement, args }) => {
    await expect(searchInput(canvasElement, 'pageSearch')).not.toBeNull();
    await expect(within(canvasElement).getByText('2 page')).toBeVisible();
    await expectReset(canvasElement, args, { q: '' });
  },
};
