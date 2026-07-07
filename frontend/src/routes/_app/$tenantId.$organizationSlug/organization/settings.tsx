import { createFileRoute } from '@tanstack/react-router';
import { OrganizationSettingsComponent } from '~/modules/organization/route-components';
import { appTitle } from '~/utils/app-title';

/**
 * Organization settings page.
 */
export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization/settings')({
  staticData: { isAuth: true, navTab: { id: 'settings', label: 'c:settings' } },
  head: ({ match }) => ({ meta: [{ title: appTitle(`Settings · ${match.context.organization?.name}`) }] }),
  component: OrganizationSettingsComponent,
});
