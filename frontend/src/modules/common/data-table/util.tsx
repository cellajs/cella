import type { NavigateFn } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { sheet } from '~/modules/common/sheeter/state';
import type { User } from '~/types/common';
import { objectKeys } from '~/utils/object';

const UserProfilePage = lazy(() => import('~/modules/users/profile-page'));

export const openUserPreviewSheet = (user: Omit<User, 'counts'>, navigate: NavigateFn, addSearch = false) => {
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
      <UserProfilePage sheet user={user} />
    </Suspense>,
    {
      className: 'max-w-full lg:max-w-4xl p-0',
      id: `user-preview-${user.id}`,
      removeCallback: () => {
        navigate({
          to: '.',
          replace: true,
          resetScroll: false,
          search: (prev) => {
            const newSearch = { ...prev };
            for (const key of objectKeys(newSearch)) {
              if (key.includes('Preview')) delete newSearch[key];
            }
            return newSearch;
          },
        });
        sheet.remove(`user-preview-${user.id}`);
      },
    },
  );
};
