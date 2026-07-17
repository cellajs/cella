import { createFileRoute } from '@tanstack/react-router';
import { OrganizationRouteComponent } from '~/modules/organization/route-components';
import { createErrorComponent } from '~/routes/_route-utils';
import { entityRouteConfig } from '~/routes-config';
import { appTitle } from '~/utils/app-title';
import { noDirectAccess } from '~/utils/no-direct-access';

/**
 * Main organization page with details and navigation.
 */
export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization')({
  staticData: { isAuth: true, floatingNavButtons: { left: 'menu' } },
  beforeLoad: ({ matches }) => {
    // Default tab comes from entityRouteConfig, so direct visits and entity links agree on the
    // organization's canonical landing surface (forks change it in routes-config, a pinned file)
    noDirectAccess(matches, '/_app/$tenantId/$organizationSlug/organization', entityRouteConfig.organization.path);
  },
  head: ({ match }) => ({ meta: [{ title: appTitle(match.context.organization?.name) }] }),
  errorComponent: createErrorComponent('app'),
  component: OrganizationRouteComponent,
});
