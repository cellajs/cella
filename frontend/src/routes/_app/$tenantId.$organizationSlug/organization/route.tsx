import { createFileRoute } from '@tanstack/react-router';
import { guardNavTabs } from '~/modules/common/page/tab-nav';
import { OrganizationRouteComponent } from '~/modules/organization/route-components';
import { createErrorComponent } from '~/routes/-route-utils';
import { channelRouteConfig } from '~/routes-config';
import { appTitle } from '~/utils/app-title';

export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization')({
  staticData: { isAuth: true, floatingNavButtons: { left: 'menu' }, tabsSlot: 'organization.tabs' },
  beforeLoad: ({ context, matches }) => {
    // Resolves the landing tab against the organization's stored arrangement and forwards away from disabled tabs.
    guardNavTabs(matches, '/_app/$tenantId/$organizationSlug/organization', {
      slotConfig: context.organization?.toolsConfig?.['organization.tabs'],
      defaultTabId: channelRouteConfig.organization.defaultTabId,
    });
  },
  head: ({ match }) => ({ meta: [{ title: appTitle(match.context.organization?.name) }] }),
  errorComponent: createErrorComponent('app'),
  component: OrganizationRouteComponent,
});
