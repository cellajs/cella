import type { ContextEntity } from 'config';
import type { LucideProps } from 'lucide-react';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import type { UserMenu } from '~/modules/users/types';

type SectionItem = {
  name: keyof UserMenu;
  entityType: ContextEntity;
  label: string;
  createForm?: React.ReactNode;
  submenu?: SectionItem;
  icon?: React.ElementType<LucideProps>;
  description?: string;
};

/**
 * Menu sections in menu sheet
 */
export const menuSections: SectionItem[] = [
  {
    name: 'organizations',
    entityType: 'organization',
    createForm: <CreateOrganizationForm replaceToCreatedOrg dialog />,
    label: 'common:organizations',
  },
];
