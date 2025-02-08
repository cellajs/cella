import type { SectionItem } from '~/modules/navigation/types';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';

// Here you declare menu sections
export const menuSections: SectionItem[] = [
  {
    name: 'organizations',
    entityType: 'organization',
    createForm: <CreateOrganizationForm replaceToCreatedOrg dialog />,
    label: 'common:organizations',
  },
];
