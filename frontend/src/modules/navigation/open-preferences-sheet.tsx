import type { RefObject } from 'react';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { navSheetClassName } from '~/modules/navigation/app-nav';
import { PreferencesSheet } from '~/modules/navigation/preferences-sheet';
import { useNavigationStore } from '~/store/navigation';

/** Open the preferences sheet as a nav-sheet (reusable across mobile nav surfaces) */
export function openPreferencesSheet(triggerRef: RefObject<HTMLButtonElement | null>, modal = false) {
  const setNavSheetOpen = useNavigationStore.getState().setNavSheetOpen;
  setNavSheetOpen('preferences');
  useSheeter.getState().create(<PreferencesSheet />, {
    id: 'nav-sheet',
    triggerRef,
    side: 'left',
    showCloseButton: false,
    modal,
    className: navSheetClassName,
    onClose: () => setNavSheetOpen(null),
  });
}
