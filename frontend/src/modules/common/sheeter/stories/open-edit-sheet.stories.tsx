import type { Meta, StoryObj } from '@storybook/react-vite';
import i18n from 'i18next';
import { type RefObject, useRef } from 'react';
import type { Organization, Tenant } from 'sdk';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Sheeter } from '~/modules/common/sheeter/provider';
import { openUpdateSheet as openUpdateOrganizationSheet } from '~/modules/organization/table/organizations-columns';
import { domainsQueryOptions } from '~/modules/tenants/query';
import { openUpdateSheet as openUpdateTenantSheet } from '~/modules/tenants/table/tenants-columns';
import { openUpdateUserSheet } from '~/modules/user/table/users-columns';
import type { BaseUser } from '~/modules/user/types';
import { useUserStore } from '~/modules/user/user-store';
import { withApp } from '~/stories/with-app';

type Opener = (triggerRef: RefObject<HTMLButtonElement | null>) => void;

// Fixtures carry the fields the edit forms read; the rest of the generated types stays unset.
const user = { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com', slug: 'ada' } as BaseUser;
const organization = {
  id: 'org-1',
  entityType: 'organization',
  name: 'Analytical Engines',
  slug: 'engines',
  languages: ['en'],
  defaultLanguage: 'en',
} as Organization;
const tenant = { id: 'tenant-1', name: 'Babbage', status: 'active' } as Tenant;

const translations = {
  edit_resource: 'Edit {{resource}}',
  user: 'User',
  organization: 'Organization',
  tenant: 'Tenant',
  domain_other: 'Domains',
  unsaved_changes: 'Unsaved changes',
};

function EditSheetTrigger({ open }: { open: Opener }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => open(triggerRef)}>
        Edit
      </button>
      <Sheeter />
    </>
  );
}

/** Edit sheets the entity tables open from a row: one form card, titled with the resource and an unsaved badge. */
const meta = {
  title: 'common/sheeter/openEditSheet',
  component: EditSheetTrigger,
  decorators: [withApp],
  parameters: { app: { queryData: [[domainsQueryOptions(tenant.id).queryKey, []]] } },
  beforeEach: () => {
    i18n.addResourceBundle('en', 'c', translations, true, true);
    // The user form compares the edited user with the signed-in one.
    useUserStore.setState({ user: { ...user, id: 'me' } as never });
    return () => {
      i18n.removeResourceBundle('en', 'c');
      useUserStore.setState({ user: null });
    };
  },
} satisfies Meta<typeof EditSheetTrigger>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opens the sheet, checks its id, title and content wrapper, then closes it and expects focus back on the trigger. */
async function openAndClose(canvasElement: HTMLElement, { id, title, container }: Record<string, string>) {
  const trigger = within(canvasElement).getByRole('button', { name: 'Edit' });
  await userEvent.click(trigger);

  const body = within(document.body);
  const sheet = await body.findByRole('dialog');
  await expect(sheet.id).toBe(id);
  await expect(within(sheet).getByRole('heading', { name: new RegExp(title) })).toBeVisible();
  await expect(within(sheet).getByText('Unsaved changes')).toBeInTheDocument();

  const form = sheet.querySelector('form');
  await expect(form).not.toBeNull();
  await expect(form?.closest('.container')?.className).toBe(container);

  // Edit sheets show no close button; Escape is the keyboard way out.
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(trigger).toHaveFocus());
  return sheet;
}

export const User: Story = {
  args: { open: (triggerRef) => openUpdateUserSheet(user, triggerRef) },
  play: async ({ canvasElement }) => {
    const sheet = await openAndClose(canvasElement, { id: 'update-user', title: 'Edit user', container: 'container' });
    await expect(sheet.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
  },
};

export const OrganizationSheet: Story = {
  name: 'Organization',
  args: { open: (triggerRef) => openUpdateOrganizationSheet(organization, triggerRef) },
  play: async ({ canvasElement }) => {
    const sheet = await openAndClose(canvasElement, {
      id: 'update-organization',
      title: 'Edit organization',
      container: 'container w-full',
    });
    const cards = sheet.querySelectorAll('[data-slot="card"]');
    await expect(cards).toHaveLength(1);
    await expect(cards[0]).toHaveClass('mb-20');
  },
};

export const TenantSheet: Story = {
  name: 'Tenant',
  args: { open: (triggerRef) => openUpdateTenantSheet(tenant, triggerRef) },
  play: async ({ canvasElement }) => {
    const sheet = await openAndClose(canvasElement, {
      id: 'update-tenant',
      title: 'Edit tenant',
      container: 'container w-full',
    });
    // The form card, then the domains card.
    const cards = [...sheet.querySelectorAll('[data-slot="card"]')];
    await expect(cards).toHaveLength(2);
    await expect(cards[0]).toHaveClass('mb-4');
    await expect(cards[0].querySelector('form')).not.toBeNull();
    await expect(cards[1]).toHaveClass('mb-20');
    await expect(cards[1]).toHaveTextContent('Domains');
  },
};
