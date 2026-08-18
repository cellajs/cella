import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import {
  attachmentsRouteSearchParamsSchema,
  attachmentsSearchDefaults,
} from '~/modules/attachment/search-params-schemas';
import { OrganizationAttachmentsComponent } from '~/modules/organization/route-components';
import { appTitle } from '~/utils/app-title';

export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization/attachments')({
  validateSearch: attachmentsRouteSearchParamsSchema,
  search: { middlewares: [stripSearchParams(attachmentsSearchDefaults)] },
  staticData: { isAuth: true, navTab: { id: 'attachments', label: 'c:attachment_other' } },
  head: ({ match }) => ({ meta: [{ title: appTitle(`Attachments · ${match.context.organization?.name}`) }] }),
  component: OrganizationAttachmentsComponent,
});
