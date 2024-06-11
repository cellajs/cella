import { createRoute } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { Suspense } from 'react';
import { queryClient } from '~/lib/router';
import ErrorNotice from '~/modules/common/error-notice';
import { UserProfile } from '~/modules/users/user-profile';
import UserSettings from '~/modules/users/user-settings';
import { IndexRoute } from './routeTree';
import { useParams } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { getUser } from '~/api/users';

export const userQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ['users', idOrSlug],
    queryFn: () => getUser(idOrSlug),
  });

export const UserProfileRoute = createRoute({
  path: '/user/$idOrSlug',
  staticData: { pageTitle: 'Profile' },
  getParentRoute: () => IndexRoute,
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
  staticData: { pageTitle: 'Settings' },
  getParentRoute: () => IndexRoute,
  component: () => <UserSettings />,
});
