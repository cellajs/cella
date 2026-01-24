import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { memo, useEffect } from 'react';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import UserSheet from '~/modules/user/user-sheet';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

function UserSheetHandlerBase() {
  const navigate = useNavigate();

  const { userSheetId } = useSearch({ strict: false });
  const { orgIdOrSlug: baseOrgIdOrSlug, idOrSlug } = useParams({ strict: false });

  const { remove: removeSheet, create: createSheet, getTriggerRef } = useSheeter();

  const orgIdOrSlug = baseOrgIdOrSlug || idOrSlug;

  useEffect(() => {
    if (!userSheetId) return;

    const sheetInstanceId = `user-sheet-${userSheetId}`;
    const sheetTrigger = getTriggerRef(userSheetId);
    const triggerRef = sheetTrigger || fallbackContentRef;

    // Defer creation to ensure the DOM and state are ready
    const timeoutId = setTimeout(() => {
      createSheet(<UserSheet idOrSlug={userSheetId} orgIdOrSlug={orgIdOrSlug} />, {
        id: sheetInstanceId,
        triggerRef,
        side: 'right',
        className: 'max-w-full lg:max-w-4xl p-0',

        onClose: (isCleanup) => {
          // If sheet is being cleaned up, do nothing
          if (isCleanup) return;

          // If trigger, simply do history back
          if (sheetTrigger) return history.back();

          navigate({
            to: '.',
            replace: true,
            resetScroll: false,
            search: (prev) => ({
              ...prev,
              userSheetId: undefined,
            }),
          });
        },
      });
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      removeSheet(sheetInstanceId, { isCleanup: true });
    };
  }, [userSheetId, orgIdOrSlug]);

  return null;
}

const UserSheetHandler = memo(UserSheetHandlerBase);

export default UserSheetHandler;
