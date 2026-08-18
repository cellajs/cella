import { createFileRoute } from '@tanstack/react-router';
import { OrganizationToolComponent } from '~/modules/organization/route-components';
import { createErrorComponent } from '~/routes/-route-utils';
import { appTitle } from '~/utils/app-title';

/** Any `organization.tabs` id without a static sibling route resolves here; the tool's own API authorizes access. */
export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization/$tool')({
  staticData: { isAuth: true },
  head: ({ match }) => ({ meta: [{ title: appTitle(match.context.organization?.name) }] }),
  component: OrganizationToolComponent,
  errorComponent: createErrorComponent('app'),
});
