import { sheet } from '~/modules/common/sheeter/state';
import UserSheet from '~/modules/users/user-sheet';

export const openUserPreviewSheet = (userId: string, orgIdOrSlug?: string) => {
  sheet.create(<UserSheet idOrSlug={userId} orgIdOrSlug={orgIdOrSlug} />, {
    className: 'max-w-full lg:max-w-4xl p-0',
    id: `user-preview-${userId}`,
    side: 'right',
    removeCallback: () => {
      setTimeout(() => {
        const userCell = document.getElementById(`user-cell-${userId}`);
        if (userCell) userCell.focus();
      }, 0);
    },
  });
};
