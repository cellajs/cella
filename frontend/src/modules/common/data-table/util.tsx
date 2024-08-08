import type { User } from '~/types';
import { sheet } from '~/modules/common/sheeter/state';
import { UserProfile } from '~/modules/users/user-profile';

export const openUserPreviewSheet = (user: User) => {
  sheet.create(<UserProfile sheet user={user} />, {
    className: 'max-w-full lg:max-w-4xl p-0',
    id: `user-preview-${user.id}`,
  });
};
