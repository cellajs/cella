import i18n from 'i18next';
import type { RefObject } from 'react';
import type { Organization } from 'sdk';
import { defineFrontendModule } from '~/lib/module';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { dangerToolBase, detailsToolBase, generalToolBase, tabsToolBase } from '~/modules/entities/channel-settings-tools';
import { CreateOrganizationForm } from '~/modules/organization/create-organization-form';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { getRouter } from '~/routes/-router-instance';
import { lazyNamed } from '~/utils/lazy-named';

const OrganizationGeneralCard = lazyNamed(() => import('~/modules/organization/settings-tools'), 'OrganizationGeneralCard');
const OrganizationDetailsCard = lazyNamed(() => import('~/modules/organization/settings-tools'), 'OrganizationDetailsCard');
const OrganizationTabsCard = lazyNamed(() => import('~/modules/organization/settings-tools'), 'OrganizationTabsCard');
const OrganizationDeleteCard = lazyNamed(() => import('~/modules/organization/settings-tools'), 'OrganizationDeleteCard');
const OrganizationsGrid = lazyNamed(() => import('~/modules/organization/organizations-grid'), 'OrganizationsGrid');

/** Opens the create dialog from the menu section's plus button and lands on the new organization. */
function createOrganizationAction(triggerRef: RefObject<HTMLButtonElement | null>) {
  const callback = (args: CallbackArgs<Organization>) => {
    if (args.status === 'success') {
      useDialoger.getState().remove('create-organization');
      getRouter().navigate({
        to: '/$tenantId/$organizationSlug/organization/members',
        params: { tenantId: args.data.tenantId, organizationSlug: args.data.slug },
      });
    }
  };

  const title = i18n.t('c:create_resource', { resource: i18n.t('c:organization').toLowerCase() });

  return useDialoger.getState().create(<CreateOrganizationForm dialog callback={callback} />, {
    className: 'md:max-w-2xl',
    id: 'create-organization',
    description: i18n.t('c:create_organization.text'),
    triggerRef,
    title,
    titleContent: <UnsavedBadge title={title} />,
  });
}

defineFrontendModule({
  name: 'organizations',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for managing organizations, the highest ancestor in the entity hierarchy.',
  channel: {
    entityType: 'organization',
    menuSection: { createAction: createOrganizationAction, label: 'c:organization_other' },
    listQuery: (params) => organizationsListQueryOptions(params),
  },
  tools: [
    {
      ...generalToolBase,
      slot: 'organization.settings',
      render: (organization) => <OrganizationGeneralCard organization={organization} />,
    },
    {
      ...detailsToolBase,
      slot: 'organization.settings',
      render: (organization) => <OrganizationDetailsCard organization={organization} />,
    },
    {
      ...tabsToolBase,
      slot: 'organization.settings',
      render: (organization) => <OrganizationTabsCard organization={organization} />,
    },
    {
      ...dangerToolBase('organization', 'c:organization'),
      slot: 'organization.settings',
      render: (organization) => <OrganizationDeleteCard organization={organization} />,
    },
    // The organizations a user is a member of, on their profile page.
    {
      id: 'organizations',
      label: 'c:organization_other',
      slot: 'user.profile',
      render: ({ user, isSheet }) => (
        <div className="container pt-4">
          <OrganizationsGrid fixedQuery={{ relatableUserId: user.id }} saveDataInSearch={!isSheet} focusView={!isSheet} />
        </div>
      ),
    },
  ],
});
