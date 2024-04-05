import { createRoute } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { Suspense } from 'react';
import { queryClient } from '~/lib/router';
import ErrorNotice from '~/modules/common/error-notice';
import { UserProfile, userQueryOptions } from '~/modules/users/user-profile';
import UserSettings from '~/modules/users/user-settings';
import { IndexRoute } from './routeTree';

export const UserProfileRoute = createRoute({
  path: '/user/$userIdentifier',
  staticData: { pageTitle: 'Profile' },
  getParentRoute: () => IndexRoute,
  loader: async ({ params: { userIdentifier } }) => {
    queryClient.ensureQueryData(userQueryOptions(userIdentifier));
  },
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => (
    <Suspense>
      <UserProfile />
    </Suspense>
  ),
});

export const UserSettingsRoute = createRoute({
  path: '/user/settings',
  staticData: { pageTitle: 'Settings' },
  getParentRoute: () => IndexRoute,
  component: () => <UserSettings />,
});
