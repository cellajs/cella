import { createFileRoute } from '@tanstack/react-router';
import { guardNavTabs } from '~/modules/common/page/tab-nav';
import { loadChannelTabGrants } from '~/modules/entities/use-channel-tab-options';
import { OrganizationRouteComponent } from '~/modules/organization/route-components';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization')({
  staticData: { floatingNavButtons: { left: 'menu' }, tabsSlot: 'organization.tabs' },
  beforeLoad: async ({ context, matches }) => {
    // Opens the first tab the surface resolves and forwards away from disabled tabs and the ones the user's grants lack.
    guardNavTabs(matches, '/_app/$tenantId/$organizationSlug/organization', {
      slotConfig: context.organization.toolsConfig['organization.tabs'],
      grants: await loadChannelTabGrants(context.organization),
    });
  },
  head: ({ match }) => pageHead(match.context.organization?.name),
  component: OrganizationRouteComponent,
});
