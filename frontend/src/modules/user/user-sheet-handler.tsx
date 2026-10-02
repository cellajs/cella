import { memo } from 'react';
import { useUrlSheet } from '~/modules/common/sheeter/use-url-sheet';
import { UserSheet } from '~/modules/user/user-sheet';
import { tw } from '~/utils/tw';

function UserSheetHandlerBase() {
  useUrlSheet({
    searchParamKey: 'userSheetId',
    renderContent: (id, organizationId) => <UserSheet id={id} organizationId={organizationId} />,
    options: { side: 'right', className: tw('max-w-full p-0 lg:max-w-4xl') },
  });

  return null;
}

export const UserSheetHandler = memo(UserSheetHandlerBase);
