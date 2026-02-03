import type { ContextEntityType } from 'config';
import i18n from 'i18next';
import type { RefObject } from 'react';
import type { Organization } from '~/api.gen';
import { CallbackArgs } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import CreateOrganizationForm from '~/modules/organization/create-organization-form';
import router from '~/routes/router';

/**
 * Create new organization from the menu.
 */
function createOrganizationAction(triggerRef: RefObject<HTMLButtonElement | null>) {
  const callback = (args: CallbackArgs<Organization>) => {
    useDialoger.getState().remove('create-organization');
    if (args.status === 'success')
      router.navigate({ to: '/$idOrSlug/organization/members', params: { idOrSlug: args.data.slug } });
  };

  return useDialoger.getState().create(<CreateOrganizationForm dialog callback={callback} />, {
    className: 'md:max-w-2xl',
    id: 'create-organization',
    triggerRef,
    title: i18n.t('common:create_resource', { resource: i18n.t('common:organization').toLowerCase() }),
    titleContent: (
      <UnsavedBadge
        title={i18n.t('common:create_resource', { resource: i18n.t('common:organization').toLowerCase() })}
      />
    ),
    description: i18n.t('common:create_organization.text'),
  });
}

/**
 * Configuration to set menu sections with options for different context entities.
 */
export const menuSectionsSchema: Partial<Record<ContextEntityType, MenuSectionOptions>> = {
  organization: { createAction: createOrganizationAction, label: 'common:organizations', entityType: 'organization' },
};
