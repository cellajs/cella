import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { sheet } from '~/modules/common/sheeter/state';
import UserSheet from '~/modules/users/user-sheet';

interface UseUserSheetProps {
  sheetId?: string;
  organizationId?: string;
}

export const useUserSheet = ({ sheetId, organizationId }: UseUserSheetProps) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (sheetId) {
      console.debug('Open user sheet', sheetId);

      const sheetInstanceId = `user-sheet-${sheetId}`;

      // Defer the creation to ensure the DOM and state are ready
      const timeoutId = setTimeout(() => {
        sheet.create(<UserSheet idOrSlug={sheetId} orgIdOrSlug={organizationId} />, {
          className: 'max-w-full lg:max-w-4xl p-0',
          id: sheetInstanceId,
          side: 'right',
          removeCallback: () => {
            // Remove `sheetId` from URL and focus back
            navigate({
              to: '.',
              replace: true,
              resetScroll: false,
              search: (prev) => ({
                ...prev,
                sheetId: undefined,
              }),
            });

            setTimeout(() => {
              const userCell = document.getElementById(`user-cell-${sheetId}`);
              if (userCell) userCell.focus();
            }, 0);
          },
        });
      }, 0);

      // Cleanup when the effect is re-triggered or component unmounts
      return () => {
        clearTimeout(timeoutId);
        sheet.remove(sheetInstanceId);
      };
    }
  }, [sheetId, organizationId]);
};
