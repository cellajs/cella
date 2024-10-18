import type { NavigateFn } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { sheet } from '~/modules/common/sheeter/state';
import type { User } from '~/types/common';

const UserProfilePage = lazy(() => import('~/modules/users/profile-page'));

export const openUserPreviewSheet = (user: Partial<User>, navigate: NavigateFn, addSearch = false) => {
  if (addSearch) {
    navigate({
      to: '.',
      replace: true,
      resetScroll: false,
      search: (prev) => ({
        ...prev,
        ...{ userIdPreview: user.id },
      }),
    });
  }
  sheet.create(
    <Suspense>
      {/* TODO fix types */}
      <UserProfilePage sheet user={user as User} />
    </Suspense>,
    {
      className: 'max-w-full lg:max-w-4xl p-0',
      id: `user-preview-${user.id}`,
      side: 'right',
      removeCallback: () => {
        navigate({
          to: '.',
          replace: true,
          resetScroll: false,
          search: (prev) => {
            const { userIdPreview: _, ...nextSearch } = prev;
            return nextSearch;
          },
        });
        sheet.remove(`user-preview-${user.id}`);
      },
    },
  );
};
