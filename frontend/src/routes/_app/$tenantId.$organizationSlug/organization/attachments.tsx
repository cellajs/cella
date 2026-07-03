import { createFileRoute } from '@tanstack/react-router';
import { attachmentsRouteSearchParamsSchema } from '~/modules/attachment/search-params-schemas';
import { OrganizationAttachmentsComponent } from '~/modules/organization/route-components';
import appTitle from '~/utils/app-title';

/**
 * Organization attachments table for file management.
 */
export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization/attachments')({
  validateSearch: attachmentsRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'attachments', label: 'c:attachment_other' } },
  head: ({ match }) => ({ meta: [{ title: appTitle(`Attachments · ${match.context.organization?.name}`) }] }),
  component: OrganizationAttachmentsComponent,
});
