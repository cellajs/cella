import { createFileRoute } from '@tanstack/react-router';
import { OrganizationRouteComponent } from '~/modules/organization/route-components';
import { createErrorComponent } from '~/routes/_route-utils';
import { appTitle } from '~/utils/app-title';
import { noDirectAccess } from '~/utils/no-direct-access';

/**
 * Main organization page with details and navigation.
 */
export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization')({
  staticData: { isAuth: true, floatingNavButtons: { left: 'menu' } },
  beforeLoad: ({ matches }) => {
    noDirectAccess(
      matches,
      '/_app/$tenantId/$organizationSlug/organization',
      '/$tenantId/$organizationSlug/organization/attachments',
    );
  },
  head: ({ match }) => ({ meta: [{ title: appTitle(match.context.organization?.name) }] }),
  errorComponent: createErrorComponent('app'),
  component: OrganizationRouteComponent,
});
