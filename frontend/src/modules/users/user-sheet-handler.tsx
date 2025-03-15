import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { memo, useEffect } from 'react';
import UserSheet from '~/modules/users/user-sheet';
import { useSheeter } from '../common/sheeter/use-sheeter';

const UserSheetHandler = memo(() => {
  const navigate = useNavigate();

  const { userSheetId, sheetContext } = useSearch({ strict: false });
  const { orgIdOrSlug: baseOrgIdOrSlug, idOrSlug } = useParams({ strict: false });

  const { remove: removeSheet, create: createSheet } = useSheeter();

  const orgIdOrSlug = baseOrgIdOrSlug || idOrSlug;

  useEffect(() => {
    if (!userSheetId || !sheetContext) return;

    console.debug('Open user sheet', userSheetId);

    const sheetInstanceId = `user-sheet-${userSheetId}`;

    // Defer creation to ensure the DOM and state are ready
    const timeoutId = setTimeout(() => {
      createSheet(<UserSheet idOrSlug={userSheetId} orgIdOrSlug={orgIdOrSlug} />, {
        className: 'max-w-full lg:max-w-4xl p-0',
        id: sheetInstanceId,
        side: 'right',
        // TODO find a way to remove a history entry when the sheet is closed. this way perhaps its better
        // for UX to not do a replace here and in the UserCell
        removeCallback: () => {
          navigate({
            to: '.',
            replace: true,
            resetScroll: false,
            search: (prev) => ({
              ...prev,
              userSheetId: undefined,
              sheetContext: undefined,
            }),
          });

          // Return focus to the original cell after closing
          setTimeout(() => {
            const cell = document.getElementById(`${sheetContext}-${userSheetId}`);
            if (cell) cell.focus();
          }, 0);
        },
      });
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      removeSheet(sheetInstanceId);
    };
  }, [userSheetId, orgIdOrSlug, sheetContext]);

  return null;
});

export default UserSheetHandler;
