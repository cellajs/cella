import { sheet } from '~/modules/common/sheeter/state';
import UserSheet from '~/modules/users/user-sheet';

export const openUserPreviewSheet = (userId: string) => {
  sheet.create(<UserSheet idOrSlug={userId} />, {
    className: 'max-w-full lg:max-w-4xl p-0',
    id: `user-preview-${userId}`,
    side: 'right',
    removeCallback: () => sheet.remove(`user-preview-${userId}`),
  });
};
