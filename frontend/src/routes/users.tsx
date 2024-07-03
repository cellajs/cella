import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import { useParams } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { Suspense } from 'react';
import { getUser } from '~/api/users';
import { queryClient } from '~/lib/router';
import ErrorNotice from '~/modules/common/error-notice';
import { UserProfile } from '~/modules/users/user-profile';
import UserSettings from '~/modules/users/user-settings';
import { AppRoute } from '.';

export const userQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ['users', idOrSlug],
    queryFn: () => getUser(idOrSlug),
  });

export const UserProfileRoute = createRoute({
  path: '/user/$idOrSlug',
  staticData: { pageTitle: 'Profile', isAuth: true },
  getParentRoute: () => AppRoute,
  loader: async ({ params: { idOrSlug } }) => {
    queryClient.ensureQueryData(userQueryOptions(idOrSlug));
  },
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => {
    const { idOrSlug } = useParams({ from: UserProfileRoute.id });
    const userQuery = useSuspenseQuery(userQueryOptions(idOrSlug));
    return (
      <Suspense>
        <UserProfile user={userQuery.data} />
      </Suspense>
    );
  },
});

export const UserSettingsRoute = createRoute({
  path: '/user/settings',
  staticData: { pageTitle: 'Settings', isAuth: true },
  getParentRoute: () => AppRoute,
  component: () => <UserSettings />,
});
