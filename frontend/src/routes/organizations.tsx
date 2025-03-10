import { createRoute, useLoaderData } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { z } from 'zod';
import ErrorNotice from '~/modules/common/error-notice';
import { organizationQueryOptions } from '~/modules/organizations/query';
import { attachmentsQueryOptions } from '~/modules/attachments/query';
import { AppRoute } from '~/routes/base';
import { noDirectAccess } from '~/utils/no-direct-access';
import { attachmentsQuerySchema } from '#/modules/attachments/schema';
import { memberInvitationsQuerySchema, membersQuerySchema } from '#/modules/memberships/schema';
import { membersQueryOptions } from '~/modules/memberships/query';

//Lazy-loaded components
const OrganizationPage = lazy(() => import('~/modules/organizations/organization-page'));
const MembersTable = lazy(() => import('~/modules/memberships/members-table/table-wrapper'));
const AttachmentsTable = lazy(() => import('~/modules/attachments/table/table-wrapper'));
const OrganizationSettings = lazy(() => import('~/modules/organizations/organization-settings'));

// Search query schema
export const membersSearchSchema = membersQuerySchema
  .pick({ q: true, sort: true, order: true, role: true })
  .extend({ sheetId: z.string().optional(), cursor: z.number().optional() });

export const memberInvitationsSearchSchema = memberInvitationsQuerySchema.pick({ sort: true, order: true });

export const attachmentsSearchSchema = attachmentsQuerySchema.pick({ q: true, sort: true, order: true }).extend({
  attachmentPreview: z.string().optional(),
  groupId: z.string().optional(),
});

export const OrganizationRoute = createRoute({
  path: '/$idOrSlug',
  staticData: { pageTitle: 'Organization', isAuth: true },
  beforeLoad: async ({ location, params: { idOrSlug } }) => {
    noDirectAccess(location.pathname, idOrSlug, '/members');
  },
  loader: async ({ params: { idOrSlug }, context }) => {
    const queryOptions = organizationQueryOptions(idOrSlug);
    return context.queryClient.ensureQueryData({ ...queryOptions, revalidateIfStale: true });
  },
  getParentRoute: () => AppRoute,
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
  component: () => {
    return (
      <Suspense>
        <OrganizationPage />
      </Suspense>
    );
  },
});

export const OrganizationMembersRoute = createRoute({
  path: '/members',
  validateSearch: membersSearchSchema,
  staticData: { pageTitle: 'members', isAuth: true },
  getParentRoute: () => OrganizationRoute,
  loaderDeps: ({ search: { q, sort, order, role, cursor } }) => ({ q, sort, order, role, cursor }),
  loader: async ({ cause, params: { idOrSlug }, deps: { q, sort, order, role, cursor }, context }) => {
    if (cause === 'enter') cursor = 0;

    try {
      const entityType = 'organization';
      const queryOptions = membersQueryOptions({ idOrSlug, orgIdOrSlug: idOrSlug, entityType, q, sort, order, role, cursor });

      const result = await context.queryClient.ensureInfiniteQueryData(queryOptions);

      return {
        data: result.pages?.flatMap((page) => page.items) ?? [],
        nextCursor: result.pages.length || 0,
        error: null,
        isLoading: false,
        totalCount: result?.pages?.[0]?.total ?? 0,
      };
    } catch (error) {
      return { data: [], nextCursor: 0, error, isLoading: false };
    }
  },
  component: () => {
    const organization = useLoaderData({ from: OrganizationRoute.id });
    if (!organization) return;
    return (
      <Suspense>
        <MembersTable key={organization.id} entity={organization} />
      </Suspense>
    );
  },
});

export const OrganizationAttachmentsRoute = createRoute({
  path: '/attachments',
  validateSearch: attachmentsSearchSchema,
  staticData: { pageTitle: 'attachments', isAuth: true },
  getParentRoute: () => OrganizationRoute,
  loaderDeps: ({ search: { q, sort, order } }) => ({ q, sort, order }),
  loader: async ({ deps: { q, sort, order }, params: { idOrSlug }, context }) => {
    try {
      const queryOptions = attachmentsQueryOptions({ orgIdOrSlug: idOrSlug, q, sort, order, limit: 5 });

      const result = await context.queryClient.ensureInfiniteQueryData(queryOptions);

      return {
        data: result.pages?.flatMap((page) => page.items) ?? [],
        nextCursor: result.pages.length || 0,
        error: null,
        isLoading: false,
        totalCount: result?.pages?.[0]?.total ?? 0,
      };
    } catch (error) {
      return { data: [], nextCursor: null, error, isLoading: false };
    }
  },
  component: () => {
    const organization = useLoaderData({ from: OrganizationRoute.id });
    if (!organization) return;
    return (
      <Suspense>
        {/* TODO: make entity, just like membersTable */}
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
