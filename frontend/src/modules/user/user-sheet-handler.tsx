import { memo, useEffect } from 'react';
import { useUrlOverlayState } from '~/hooks/use-url-overlay-state';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import UserSheet from '~/modules/user/user-sheet';

/**
 * Handles opening/closing the user sheet based on URL search params.
 * Listens to `userSheetId` in search params and manages the sheet lifecycle.
 */
function UserSheetHandlerBase() {
  const { isOpen, value, orgIdOrSlug, triggerRef, close } = useUrlOverlayState('userSheetId', 'sheet');

  useEffect(() => {
    if (!isOpen || !value) return;

    const instanceId = `user-sheet-${value}`;

    // Skip if sheet already exists
    if (useSheeter.getState().get(instanceId)) return;

    queueMicrotask(() => {
      useSheeter.getState().create(<UserSheet idOrSlug={value} orgIdOrSlug={orgIdOrSlug} />, {
        id: instanceId,
        triggerRef,
        onClose: close,
        side: 'right',
        className: 'max-w-full lg:max-w-4xl p-0',
      });
    });

    return () => useSheeter.getState().remove(instanceId, { isCleanup: true });
  }, [isOpen, value, orgIdOrSlug, triggerRef, close]);

  return null;
}

const UserSheetHandler = memo(UserSheetHandlerBase);

export default UserSheetHandler;
