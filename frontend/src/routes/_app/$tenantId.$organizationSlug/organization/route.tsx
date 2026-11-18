import { createFileRoute } from '@tanstack/react-router';
import { OrganizationRouteComponent } from '~/modules/organization/route-components';
import { organizationTabsBeforeLoad } from '~/modules/organization/route-logic';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization')({
  staticData: { floatingNavButtons: { left: 'menu' }, tabsSlot: 'organization.tabs' },
  // Annotated: an inferred async return would make the route's type depend on the route tree it is part of.
  beforeLoad: ({ context, matches }): Promise<void> => organizationTabsBeforeLoad({ context, matches }),
  head: ({ match }) => pageHead(match.context.organization?.name),
  component: OrganizationRouteComponent,
});
