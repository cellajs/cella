import { createFileRoute } from '@tanstack/react-router';
import { OrganizationToolComponent } from '~/modules/organization/route-components';
import { createErrorComponent } from '~/routes/-route-utils';
import { appTitle } from '~/utils/app-title';

/**
 * Host route for the organization's registry tab tools (`organization.tabs` slot). Any tab id not
 * matched by a static sibling route resolves here and renders the matching registry tool; the tab
 * bar and its gating come from the tools slot, so modules and installed tools add tabs without new
 * route files. The tool's own API authorizes data access; this route is a UI surface only.
 */
export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization/$tool')({
  staticData: { isAuth: true },
  head: ({ match }) => ({ meta: [{ title: appTitle(match.context.organization?.name) }] }),
  component: OrganizationToolComponent,
  errorComponent: createErrorComponent('app'),
});
