import { createRoute, redirect, useParams } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import ErrorNotice, { getErrorInfo } from '~/modules/common/error-notice';
import Spinner from '~/modules/common/spinner';
import { ToastSeverity } from '~/modules/common/toaster/service';
import { meAuthQueryOptions } from '~/modules/me/query';
import { userQueryOptions } from '~/modules/user/query';
import { queryClient } from '~/query/query-client';
import { AppLayoutRoute, errorSearchSchema } from '~/routes/base-routes';
import { useToastStore } from '~/store/toast';
import appTitle from '~/utils/app-title';

const UserProfilePage = lazy(() => import('~/modules/user/profile-page'));
const UserAccountPage = lazy(() => import('~/modules/me/account-page'));

/**
 * User profile page displaying public user information.
 */
export const UserProfileRoute = createRoute({
  path: '/user/$idOrSlug',
  staticData: { isAuth: true },
  getParentRoute: () => AppLayoutRoute,
  loader: async ({ params: { idOrSlug } }) => {
    const userOptions = userQueryOptions(idOrSlug);
    return queryClient.ensureQueryData({ ...userOptions });
  },
  head: (ctx) => {
    const user = ctx.match.loaderData;
    return { meta: [{ title: appTitle(user?.name) }] };
  },
  errorComponent: ({ error }) => <ErrorNotice boundary="app" error={error} />,
  component: () => {
    const { idOrSlug } = useParams({ from: '/appLayout/user/$idOrSlug' });
    return (
      <Suspense>
        <UserProfilePage key={idOrSlug} idOrSlug={idOrSlug} />
      </Suspense>
    );
  },
});

/**
 * User profile page within an organization context.
 */
export const UserInOrganizationProfileRoute = createRoute({
  path: '/$orgIdOrSlug/user/$idOrSlug',
  staticData: { isAuth: true },
  getParentRoute: () => AppLayoutRoute,
  loader: async ({ params: { idOrSlug } }) => {
    const userOptions = userQueryOptions(idOrSlug);
    return queryClient.ensureQueryData({ ...userOptions });
  },
  head: (ctx) => {
    const user = ctx.match.loaderData;
    return { meta: [{ title: appTitle(user?.name) }] };
  },
  errorComponent: ({ error }) => <ErrorNotice boundary="app" error={error} />,
  component: () => {
    const { idOrSlug, orgIdOrSlug } = useParams({ from: '/appLayout/$orgIdOrSlug/user/$idOrSlug' });
    return (
      <Suspense>
        <UserProfilePage key={idOrSlug} idOrSlug={idOrSlug} orgIdOrSlug={orgIdOrSlug} />
      </Suspense>
    );
  },
});

/**
 * User account settings page for personal configuration.
 */
export const UserAccountRoute = createRoute({
  path: '/account',
  staticData: { isAuth: true },
  validateSearch: errorSearchSchema,
  head: () => ({ meta: [{ title: appTitle('My account') }] }),
  getParentRoute: () => AppLayoutRoute,
  beforeLoad: ({ search }) => {
    if (search.error) {
      const { message } = getErrorInfo({ errorFromQuery: search.error });

      const severityMap: Record<string, ToastSeverity> = { error: 'error', warn: 'warning', fatal: 'error' };

      const toastSeverity = severityMap[search.severity || 'warning'];
      useToastStore.getState().showToast(message, toastSeverity);
      throw redirect({ to: '/account', replace: true });
    }
  },
  loader: async () => {
    const userAuthOptions = meAuthQueryOptions();
    return queryClient.ensureQueryData({ ...userAuthOptions });
  },
  component: () => {
    return (
      <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
        <UserAccountPage />
      </Suspense>
    );
  },
});
