import { onlineManager } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toaster } from '~/modules/common/toaster/toaster';

/** Opens a user's profile sheet from where the caller is, through the `userSheetId` search param; offline it says the sheet needs a connection. */
export function useOpenUserSheet() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (userId: string) => {
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));
    navigate({ to: '.', replace: false, resetScroll: false, search: (prev) => ({ ...prev, userSheetId: userId }) });
  };
}
