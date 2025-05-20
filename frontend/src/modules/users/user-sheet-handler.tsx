import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { memo, useEffect } from 'react';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import UserSheet from '~/modules/users/user-sheet';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

const UserSheetHandler = memo(() => {
  const navigate = useNavigate();

  const { userSheetId } = useSearch({ strict: false });
  const { orgIdOrSlug: baseOrgIdOrSlug, idOrSlug } = useParams({ strict: false });

  const { remove: removeSheet, create: createSheet, getTriggerRef } = useSheeter();

  const orgIdOrSlug = baseOrgIdOrSlug || idOrSlug;

  useEffect(() => {
    if (!userSheetId) return;

    const sheetInstanceId = `user-sheet-${userSheetId}`;
    const triggerRef = getTriggerRef(userSheetId) || fallbackContentRef;

    // Defer creation to ensure the DOM and state are ready
    const timeoutId = setTimeout(() => {
      createSheet(<UserSheet idOrSlug={userSheetId} orgIdOrSlug={orgIdOrSlug} />, {
        id: sheetInstanceId,
        triggerRef,
        side: 'right',
        className: 'max-w-full lg:max-w-4xl p-0',
        // TODO(IMPROVE) find a way to remove a history entry when the sheet is closed. this way perhaps its better
        // for UX to not do a replace here and in the UserCell
        onClose: () => {
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
      removeSheet(sheetInstanceId);
    };
  }, [userSheetId, orgIdOrSlug]);

  return null;
});

export default UserSheetHandler;
