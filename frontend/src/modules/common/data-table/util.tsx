import { Suspense, lazy } from 'react';
import { sheet } from '~/modules/common/sheeter/state';
import type { User } from '~/types';

const UserProfilePage = lazy(() => import('~/modules/users/profile-page'));

export const openUserPreviewSheet = (user: Omit<User, 'counts'>) => {
  sheet.create(
    <Suspense>
      <UserProfilePage sheet user={user} />
    </Suspense>,
    {
      className: 'max-w-full lg:max-w-4xl p-0',
      id: `user-preview-${user.id}`,
    },
  );
};
