import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useUrlSheet } from '~/hooks/use-url-overlay';
import { UserSheet } from '~/modules/user/user-sheet';

/**
 * Handles opening/closing the user sheet based on URL search params.
 * Listens to `userSheetId` in search params and manages the sheet lifecycle.
 */
function UserSheetHandlerBase() {
  const { t } = useTranslation();

  useUrlSheet({
    searchParamKey: 'userSheetId',
    renderContent: (id, orgId) => <UserSheet id={id} orgId={orgId} />,
    options: {
      side: 'right',
      className: 'max-w-full lg:max-w-4xl p-0',
      title: t('common:user'),
    },
  });

  return null;
}

export const UserSheetHandler = memo(UserSheetHandlerBase);
