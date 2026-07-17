import i18n from 'i18next';
import type { RefObject } from 'react';
import type { Organization } from 'sdk';
import type { ChannelEntityType } from 'shared';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import { CreateOrganizationForm } from '~/modules/organization/create-organization-form';
import { getRouter } from '~/routes/_router-instance';

/**
 * Create new organization from the menu.
 */
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

  return useDialoger.getState().create(<CreateOrganizationForm dialog callback={callback} />, {
    className: 'md:max-w-2xl',
    id: 'create-organization',
    description: i18n.t('c:create_organization.text'),
    triggerRef,
    title: i18n.t('c:create_resource', { resource: i18n.t('c:organization').toLowerCase() }),
    titleContent: (
      <UnsavedBadge title={i18n.t('c:create_resource', { resource: i18n.t('c:organization').toLowerCase() })} />
    ),
  });
}

/**
 * Configuration to set menu sections with options for different channel entities.
 */
export const menuSectionsSchema: Partial<Record<ChannelEntityType, MenuSectionOptions>> = {
  organization: { createAction: createOrganizationAction, label: 'c:organization_other', entityType: 'organization' },
};
