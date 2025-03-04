import { createRoute, useParams } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { z } from 'zod';
import { attachmentsQueryOptions } from '~/modules/attachments/query';
import ErrorNotice from '~/modules/common/error-notice';
import { membersQueryOptions } from '~/modules/memberships/query';
import { organizationQueryOptions } from '~/modules/organizations/query';
import { hybridFetch, hybridFetchInfinite } from '~/query/hybrid-fetch';
import { queryClient } from '~/query/query-client';

import type { Organization as OrganizationType } from '~/modules/organizations/types';
import { AppRoute } from '~/routes/general';
import { noDirectAccess } from '~/utils/no-direct-access';
import { attachmentsQuerySchema } from '#/modules/attachments/schema';
import { invitedMembersQuerySchema, membersQuerySchema } from '#/modules/memberships/schema';

//Lazy-loaded components
const OrganizationPage = lazy(() => import('~/modules/organizations/organization-page'));
const OrgMembersTable = lazy(() => import('~/modules/organizations/organization-members-table'));
const AttachmentsTable = lazy(() => import('~/modules/attachments/table/table-wrapper'));
const OrganizationSettings = lazy(() => import('~/modules/organizations/organization-settings'));

// Search query schema
export const membersSearchSchema = membersQuerySchema
  .pick({ q: true, sort: true, order: true, role: true })
  .extend({ sheetId: z.string().optional() });

export const invitedMembersSearchSchema = invitedMembersQuerySchema.pick({ sort: true, order: true });

export const attachmentsSearchSchema = attachmentsQuerySchema.pick({ q: true, sort: true, order: true }).extend({
  attachmentPreview: z.string().optional(),
  groupId: z.string().optional(),
});

export const OrganizationRoute = createRoute({
  path: '/$idOrSlug',
  staticData: { pageTitle: 'Organization', isAuth: true },
  beforeLoad: async ({ location, cause, params: { idOrSlug } }) => {
    noDirectAccess(location.pathname, idOrSlug, '/members');
    const queryOptions = organizationQueryOptions(idOrSlug);

    // Prevents unnecessary fetches(runs when user enters page)
    if (cause !== 'enter') {
      const { id: organizationId, membership } = await queryClient.ensureQueryData(queryOptions);
      return { orgIdOrSlug: organizationId, isAdmin: membership?.role === 'admin' };
    }

    const organization = await hybridFetch<OrganizationType>(queryOptions);
    return { orgIdOrSlug: organization?.id || idOrSlug };
  },
  getParentRoute: () => AppRoute,
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
  component: () => {
    const { idOrSlug } = useParams({ from: OrganizationRoute.id });
    return (
      <Suspense>
        <OrganizationPage key={idOrSlug} />
      </Suspense>
    );
  },
});

export const OrganizationMembersRoute = createRoute({
  path: '/members',
  validateSearch: membersSearchSchema,
  staticData: { pageTitle: 'members', isAuth: true },
  getParentRoute: () => OrganizationRoute,
  loaderDeps: ({ search: { q, sort, order, role } }) => ({ q, sort, order, role }),
  loader: ({ cause, params: { idOrSlug }, deps: { q, sort, order, role }, context: { orgIdOrSlug } }) => {
    // Prevents unnecessary fetches(runs when user enters page)
    if (cause !== 'enter') return;

    const entityType = 'organization';

    const queryOptions = membersQueryOptions({ idOrSlug, orgIdOrSlug, entityType, q, sort, order, role });
    return hybridFetchInfinite(queryOptions);
  },
  component: () => (
    <Suspense>
      <OrgMembersTable />
    </Suspense>
  ),
});

export const OrganizationAttachmentsRoute = createRoute({
  path: '/attachments',
  validateSearch: attachmentsSearchSchema,
  staticData: { pageTitle: 'attachments', isAuth: true },
  getParentRoute: () => OrganizationRoute,
  loaderDeps: ({ search: { q, sort, order } }) => ({ q, sort, order }),
  loader: ({ cause, deps: { q, sort, order }, context: { orgIdOrSlug } }) => {
    // Prevents unnecessary fetches(runs when user enters page)
    if (cause !== 'enter') return;

    const queryOptions = attachmentsQueryOptions({ orgIdOrSlug, q, sort, order });
    return hybridFetchInfinite(queryOptions);
  },
  component: () => {
    const { idOrSlug } = useParams({ from: OrganizationAttachmentsRoute.id });
    const orgQueryOptions = organizationQueryOptions(idOrSlug);
    const organization: OrganizationType | undefined = queryClient.getQueryData(orgQueryOptions.queryKey);

    if (!organization) return;
    return (
      <Suspense>
        <AttachmentsTable organization={organization} />
      </Suspense>
    );
  },
});

export const OrganizationSettingsRoute = createRoute({
  path: '/settings',
  staticData: { pageTitle: 'settings', isAuth: true },
  getParentRoute: () => OrganizationRoute,
  component: () => (
    <Suspense>
      <OrganizationSettings />
    </Suspense>
  ),
});
