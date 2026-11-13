import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { withSuspense } from '~/modules/common/with-suspense';
import { OrganizationsPage } from '~/modules/organization/organizations-page';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_app/organizations')({
  head: () => pageHead(i18n.t('c:organization_other')),
  component: withSuspense(OrganizationsPage),
});
