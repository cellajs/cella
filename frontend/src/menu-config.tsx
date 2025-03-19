import type { ContextEntity } from 'config';
import type { LucideProps } from 'lucide-react';
import { i18n } from '~/lib/i18n';
import router from '~/lib/router';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import { organizationsKeys } from '~/modules/organizations/query';
import type { Organization } from '~/modules/organizations/types';

type SectionsSchema = {
  label: string;
  createAction?: () => void;
  icon?: React.ElementType<LucideProps>;
};

/**
 * Create new organization from the menu.
 */
const createOrganizationAction = () => {
  const callback = (createdOrganization: Organization) => {
    useDialoger.getState().remove('create-organization');
    router.navigate({ to: '/$idOrSlug/members', params: { idOrSlug: createdOrganization.slug } });
  };

  return useDialoger.getState().create(<CreateOrganizationForm dialog callback={callback} />, {
    className: 'md:max-w-2xl',
    id: 'create-organization',
    title: i18n.t('common:create_resource', { resource: i18n.t('common:organization').toLowerCase() }),
    titleContent: <UnsavedBadge title={i18n.t('common:create_resource', { resource: i18n.t('common:organization').toLowerCase() })} />,
  });
};

/**
 * Configuration to set menu sections with options for different context entities.
 */
export const menuSectionsSchemas: Partial<Record<ContextEntity, SectionsSchema>> = {
  organization: { createAction: createOrganizationAction, label: 'common:organizations' },
};

/**
 * Configuration to by with key update membership in contextEntity
 */
//TODO find way to avoid usage of it
export const contextEntityCacheKeys = {
  organization: organizationsKeys.singleBase(),
};
