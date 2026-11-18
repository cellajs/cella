import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { membersRouteSearchParamsSchema, membersSearchDefaults } from '~/modules/memberships/search-params-schemas';
import { EmbeddedOrganizationComponent } from '~/modules/organization/route-components';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/embed/$tenantId/$organizationSlug/organization')({
  validateSearch: membersRouteSearchParamsSchema,
  search: { middlewares: [stripSearchParams(membersSearchDefaults)] },
  head: ({ match }) => pageHead(match.context.organization?.name),
  component: EmbeddedOrganizationComponent,
});
