import type { ContextEntity } from 'config';
import type { LucideProps } from 'lucide-react';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';

type SectionsSchema = {
  label: string;
  createForm?: React.ReactNode;
  icon?: React.ElementType<LucideProps>;
  description?: string;
};

export const menuSectionsSchemas: Record<ContextEntity, SectionsSchema> = {
  organization: { createForm: <CreateOrganizationForm replaceToCreatedOrg dialog />, label: 'common:organizations' },
};
