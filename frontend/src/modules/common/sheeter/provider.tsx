import { useEffect } from 'react';
import useBodyClass from '~/hooks/use-body-class';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import router from '~/lib/router';
import { MobileSheet } from '~/modules/common/sheeter/drawer';
import { DesktopSheet } from '~/modules/common/sheeter/sheet';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useNavigationStore } from '~/store/navigation';

/**
 * Sheeter provider to render drawers on mobile and sheets on other screens.
 * State is managed by the useSheeter zustand store hook.
 */
export const Sheeter = () => {
  const isMobile = useBreakpoints('max', 'sm');

  // Get sheets from store
  const sheets = useSheeter((state) => state.sheets);

  // Apply body class
  useBodyClass({ 'sheeter-open': sheets.length > 0 });

  // Subscribe to router to close sheets
  useEffect(() => {
    router.subscribe('onBeforeRouteMount', ({ pathChanged }) => {
      const navState = useNavigationStore.getState();
      const sheetOpen = navState.navSheetOpen;
      const activeSheets = useSheeter.getState().sheets;

      if (!pathChanged || !activeSheets.length) return;

      // Safe to remove all sheets
      if (sheetOpen && (sheetOpen !== 'menu' || !navState.keepMenuOpen)) {
        return useSheeter.getState().remove();
      }

      // Remove all sheets except the nav sheet
      const removeSheetIds = sheets.filter((sheet) => sheet.id !== 'nav-sheet').map((sheet) => sheet.id);
      for (const sheetId of removeSheetIds) {
        useSheeter.getState().remove(sheetId);
      }
    });
  }, []);

  if (!sheets.length) return null;

  return (
    <>
      {sheets.map((sheet) => {
        const SheetComponent = isMobile ? MobileSheet : DesktopSheet;
        return <SheetComponent key={sheet.id} sheet={sheet} />;
      })}
    </>
  );
};
