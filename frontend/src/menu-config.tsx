import type { ContextEntity } from 'config';
import type { LucideProps } from 'lucide-react';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import { i18n } from './lib/i18n';
import router from './lib/router';
import { dialog } from './modules/common/dialoger/state';
import UnsavedBadge from './modules/common/unsaved-badge';
import type { Organization } from './modules/organizations/types';

type SectionsSchema = {
  label: string;
  createAction?: () => void;
  icon?: React.ElementType<LucideProps>;
};

const createOrganizationAction = () => {
  const callback = (createdOrganization: Organization) => {
    dialog.remove(true, 'create-organization');
    router.navigate({ to: '/$idOrSlug/members', params: { idOrSlug: createdOrganization.slug } });
  };

  return dialog(<CreateOrganizationForm dialog callback={callback} />, {
    className: 'md:max-w-2xl',
    id: 'create-organization',
    title: i18n.t('common:create_resource', { resource: i18n.t('common:organization').toLowerCase() }),
    titleContent: <UnsavedBadge title={i18n.t('common:create_resource', { resource: i18n.t('common:organization').toLowerCase() })} />,
  });
};

export const menuSectionsSchemas: Partial<Record<ContextEntity, SectionsSchema>> = {
  organization: { createAction: createOrganizationAction, label: 'common:organizations' },
};
