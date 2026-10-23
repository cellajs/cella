import { onlineManager } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toastOffline } from '~/modules/common/toaster/toaster';

/** Opens a user's profile sheet from where the caller is, through the `userSheetId` search param; offline it says the sheet needs a connection. */
export function useOpenUserSheet() {
  const navigate = useNavigate();

  return (userId: string) => {
    if (!onlineManager.isOnline()) return toastOffline();
    navigate({ to: '.', replace: false, resetScroll: false, search: (prev) => ({ ...prev, userSheetId: userId }) });
  };
}
