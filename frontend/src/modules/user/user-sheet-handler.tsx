import { memo } from 'react';
import { useUrlSheet } from '~/hooks/use-url-sheet';
import UserSheet from '~/modules/user/user-sheet';

/**
 * Handles opening/closing the user sheet based on URL search params.
 * Listens to `userSheetId` in search params and manages the sheet lifecycle.
 */
function UserSheetHandlerBase() {
  useUrlSheet({
    searchParamKey: 'userSheetId',
    type: 'sheet',
    instanceId: (id) => `user-sheet-${id}`,
    renderContent: (id, orgIdOrSlug) => <UserSheet idOrSlug={id} orgIdOrSlug={orgIdOrSlug} />,
    options: {
      side: 'right',
      className: 'max-w-full lg:max-w-4xl p-0',
    },
  });

  return null;
}

const UserSheetHandler = memo(UserSheetHandlerBase);

export default UserSheetHandler;
