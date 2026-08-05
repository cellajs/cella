import { createFileRoute } from '@tanstack/react-router';
import { guardNavTabs } from '~/modules/common/page/tab-nav';
import { OrganizationRouteComponent } from '~/modules/organization/route-components';
import { createErrorComponent } from '~/routes/-route-utils';
import { channelRouteConfig } from '~/routes-config';
import { appTitle } from '~/utils/app-title';

/**
 * Main organization page with details and navigation.
 */
export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization')({
  staticData: { isAuth: true, floatingNavButtons: { left: 'menu' }, tabsSlot: 'organization.tabs' },
  beforeLoad: ({ context, matches }) => {
    // Entity links target this layout tab-less; the landing tab resolves here against the
    // organization's stored arrangement, preferring the app's pick from routes-config (a pinned
    // file). The same guard forwards navigations aimed at a tab the arrangement disables.
    guardNavTabs(matches, '/_app/$tenantId/$organizationSlug/organization', {
      slotConfig: context.organization?.toolsConfig?.['organization.tabs'],
      defaultTabId: channelRouteConfig.organization.defaultTabId,
    });
  },
  head: ({ match }) => ({ meta: [{ title: appTitle(match.context.organization?.name) }] }),
  errorComponent: createErrorComponent('app'),
  component: OrganizationRouteComponent,
});
