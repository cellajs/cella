import { createRoute, useLoaderData, useParams } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import ErrorNotice from '~/modules/common/error-notice';
import Spinner from '~/modules/common/spinner';
import { meAuthQueryOptions } from '~/modules/me/query';
import { userQueryOptions } from '~/modules/users/query';
import { queryClient } from '~/query/query-client';
import { AppRoute } from '~/routes/base';
import appTitle from '~/utils/app-title';

const UserProfilePage = lazy(() => import('~/modules/users/profile-page'));
const UserSettingsPage = lazy(() => import('~/modules/me/settings-page'));

export const UserProfileRoute = createRoute({
  path: '/users/$idOrSlug',
  staticData: { isAuth: true },
  getParentRoute: () => AppRoute,
  loader: async ({ params: { idOrSlug } }) => {
    const userOptions = userQueryOptions(idOrSlug);
    const options = { ...userOptions, revalidateIfStale: true };
    return queryClient.ensureQueryData(options);
  },
  head: (ctx) => {
    const user = ctx.match.loaderData;
    return { meta: [{ title: appTitle(user?.name) }] };
  },
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
  component: () => {
    // Get user info from route
    const user = useLoaderData({ from: UserProfileRoute.id });
    return (
      <Suspense>
        <UserProfilePage key={user.id} user={user} />
      </Suspense>
    );
  },
});

export const UserInOrganizationProfileRoute = createRoute({
  path: '/$orgIdOrSlug/users/$idOrSlug',
  staticData: { isAuth: true },
  getParentRoute: () => AppRoute,
  loader: async ({ params: { idOrSlug } }) => {
    const userOptions = userQueryOptions(idOrSlug);
    const options = { ...userOptions, revalidateIfStale: true };
    return queryClient.ensureQueryData(options);
  },
  head: (ctx) => {
    const user = ctx.match.loaderData;
    return { meta: [{ title: appTitle(user?.name) }] };
  },
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
  component: () => {
    const { orgIdOrSlug } = useParams({ from: UserInOrganizationProfileRoute.id });
    const user = useLoaderData({ from: UserInOrganizationProfileRoute.id });
    return (
      <Suspense>
        <UserProfilePage key={user.id} user={user} orgIdOrSlug={orgIdOrSlug} />
      </Suspense>
    );
  },
});

export const UserSettingsRoute = createRoute({
  path: '/settings',
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Settings') }] }),
  getParentRoute: () => AppRoute,
  loader: async () => {
    const userAuthOptions = meAuthQueryOptions();
    const options = { ...userAuthOptions, revalidateIfStale: true };
    return queryClient.ensureQueryData(options);
  },
  component: () => {
    return (
      <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
        <UserSettingsPage />
      </Suspense>
    );
  },
});
