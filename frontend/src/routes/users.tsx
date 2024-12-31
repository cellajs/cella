import { useSuspenseQuery } from '@tanstack/react-query';
import { createRoute, useParams } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { queryClient } from '~/lib/router';
import ErrorNotice from '~/modules/common/error-notice';
import { userQueryOptions } from '~/modules/users/query';
import { baseEntityRoutes } from '~/nav-config';
import { AppRoute } from '~/routes/general';
import type { ErrorType } from '#/lib/errors';

const UserProfilePage = lazy(() => import('~/modules/users/profile-page'));
const UserSettingsPage = lazy(() => import('~/modules/users/settings-page'));

export const UserProfileRoute = createRoute({
  path: baseEntityRoutes.user,
  staticData: { pageTitle: 'Profile', isAuth: true },
  getParentRoute: () => AppRoute,
  loader: async ({ params: { idOrSlug } }) => queryClient.ensureQueryData(userQueryOptions(idOrSlug)),
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => {
    const { idOrSlug } = useParams({ from: UserProfileRoute.id });
    const { data: user } = useSuspenseQuery(userQueryOptions(idOrSlug));
    return (
      <Suspense>
        <UserProfilePage key={idOrSlug} user={user} />
      </Suspense>
    );
  },
});

export const UserSettingsRoute = createRoute({
  path: '/user/settings',
  staticData: { pageTitle: 'Settings', isAuth: true },
  getParentRoute: () => AppRoute,
  component: () => (
    <Suspense>
      <UserSettingsPage />
    </Suspense>
  ),
});
