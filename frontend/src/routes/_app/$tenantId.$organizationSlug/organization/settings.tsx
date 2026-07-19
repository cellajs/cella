import { createFileRoute } from '@tanstack/react-router';
import { OrganizationSettingsComponent } from '~/modules/organization/route-components';
import { requireEntityAction } from '~/routes/-permission-guard';
import { appTitle } from '~/utils/app-title';

/**
 * Organization settings page.
 */
export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization/settings')({
  staticData: { isAuth: true, navTab: { id: 'settings', label: 'c:settings', requires: 'update' } },
  beforeLoad: ({ context }) => {
    // Same grant the tab's `requires: 'update'` hides on — direct URLs get the same gate.
    requireEntityAction(
      context.organization,
      'organization',
      'organization',
      'update',
      '/$tenantId/$organizationSlug/organization',
    );
  },
  head: ({ match }) => ({ meta: [{ title: appTitle(`Settings · ${match.context.organization?.name}`) }] }),
  component: OrganizationSettingsComponent,
});
