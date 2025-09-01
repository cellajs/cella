import type { ContextEntityType } from 'config';
import i18n from 'i18next';
import type { RefObject } from 'react';
import type { Organization } from '~/api.gen';
import router from '~/lib/router';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';

/**
 * Create new organization from the menu.
 */
const createOrganizationAction = (triggerRef: RefObject<HTMLButtonElement | null>) => {
  const callback = (createdOrganization: Organization) => {
    useDialoger.getState().remove('create-organization');
    router.navigate({ to: '/organizations/$idOrSlug/members', params: { idOrSlug: createdOrganization.slug } });
  };

  return useDialoger.getState().create(<CreateOrganizationForm dialog callback={callback} />, {
    className: 'md:max-w-2xl',
    id: 'create-organization',
    triggerRef,
    title: i18n.t('common:create_resource', { resource: i18n.t('common:organization').toLowerCase() }),
    titleContent: <UnsavedBadge title={i18n.t('common:create_resource', { resource: i18n.t('common:organization').toLowerCase() })} />,
    description: i18n.t('common:create_organization.text'),
  });
};

/**
 * Configuration to set menu sections with options for different context entities.
 */
export const menuSectionsSchema: Partial<Record<ContextEntityType, MenuSectionOptions>> = {
  organization: { createAction: createOrganizationAction, label: 'common:organizations', entityType: 'organization' },
};
