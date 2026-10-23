import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import i18n from 'i18next';
import { attachmentsRouteSearchParamsSchema, attachmentsSearchDefaults } from '~/modules/attachment/search-params-schemas';
import { OrganizationAttachmentsComponent } from '~/modules/organization/route-components';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization/attachments')({
  validateSearch: attachmentsRouteSearchParamsSchema,
  search: { middlewares: [stripSearchParams(attachmentsSearchDefaults)] },
  staticData: { isAuth: true, navTab: { id: 'attachments', label: 'c:attachment_other', description: 'c:tab_attachments.text' } },
  head: ({ match }) => pageHead(`${i18n.t('c:attachment_other')} · ${match.context.organization?.name}`),
  component: OrganizationAttachmentsComponent,
});
