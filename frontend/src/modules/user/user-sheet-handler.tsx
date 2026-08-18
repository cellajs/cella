import { memo } from 'react';
import { useUrlSheet } from '~/modules/common/sheeter/use-url-sheet';
import { UserSheet } from '~/modules/user/user-sheet';

function UserSheetHandlerBase() {
  useUrlSheet({
    searchParamKey: 'userSheetId',
    renderContent: (id, organizationId) => <UserSheet id={id} organizationId={organizationId} />,
    options: {
      side: 'right',
      className: 'max-w-full lg:max-w-4xl p-0',
    },
  });

  return null;
}

export const UserSheetHandler = memo(UserSheetHandlerBase);
