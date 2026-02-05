import { useNavigate } from '@tanstack/react-router';
import { t } from 'i18next';
import { memo, useEffect, useRef } from 'react';
import { UserBase } from '~/api.gen/types.gen';
import { useUrlOverlayState } from '~/hooks/use-url-overlay-state';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import UserSheet from '~/modules/user/user-sheet';
import { useFindInListCache } from '~/query/basic/find-in-list-cache';
import { toaster } from '../common/toaster/service';

/**
 * Handles opening/closing the user sheet based on URL search params.
 * Listens to `userSheetId` in search params and manages the sheet lifecycle.
 */
function UserSheetHandlerBase() {
  const navigate = useNavigate();
  const { isOpen, value, triggerRef, close } = useUrlOverlayState('userSheetId', {
    getStore: useSheeter.getState,
  });

  // TODO not all users are found
  const user = useFindInListCache<UserBase>([['user'], ['member']], value || '');

  // Keep refs to avoid re-running effect when these change
  const triggerRefRef = useRef(triggerRef);
  const closeRef = useRef(close);
  triggerRefRef.current = triggerRef;
  closeRef.current = close;

  useEffect(() => {
    if (!isOpen || !value) return;

    if (!user) {
      navigate({ to: '.', replace: true });
      toaster(t('error:resource_not_found', { resource: t('common:user') }), 'warning');
      return;
    }
    const instanceId = `user-sheet-${value}`;

    // Skip if sheet already exists
    if (useSheeter.getState().get(instanceId)) return;

    queueMicrotask(() => {
      useSheeter.getState().create(<UserSheet user={user} />, {
        id: instanceId,
        triggerRef: triggerRefRef.current,
        onClose: (isCleanup) => closeRef.current(isCleanup),
        side: 'right',
        className: 'max-w-full lg:max-w-4xl p-0',
      });
    });

    return () => useSheeter.getState().remove(instanceId, { isCleanup: true });
  }, [isOpen, value]);

  return null;
}

const UserSheetHandler = memo(UserSheetHandlerBase);

export default UserSheetHandler;
