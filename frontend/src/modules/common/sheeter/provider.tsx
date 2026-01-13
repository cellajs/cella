import { useEffect } from 'react';
import useBodyClass from '~/hooks/use-body-class';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import router from '~/lib/router';
import { SheeterDrawer } from '~/modules/common/sheeter/drawer';
import { SheeterSheet } from '~/modules/common/sheeter/sheet';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useNavigationStore } from '~/store/navigation';

/**
 * Sheeter provider to render drawers on mobile, sheets on desktop.
 * When container is provided, sheets are portaled into the container element.
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
    const unsubscribe = router.subscribe('onBeforeLoad', ({ hrefChanged }) => {
      const navState = useNavigationStore.getState();
      const sheetOpen = navState.navSheetOpen;
      const activeSheets = useSheeter.getState().sheets;

      if (!hrefChanged || !activeSheets.length) return;

      // Filter to only sheets that should close on route change
      const sheetsToClose = activeSheets.filter((sheet) => sheet.closeSheetOnRouteChange !== false);
      if (!sheetsToClose.length) return;

      // Safe to remove sheets that opt-in to close on route change
      if (!sheetOpen || sheetOpen !== 'menu' || !navState.keepMenuOpen) {
        return useSheeter.getState().removeOnRouteChange();
      }

      // Remove sheets except the nav sheet (if it should close on route change)
      const removeSheetIds = sheetsToClose.filter((sheet) => sheet.id !== 'nav-sheet').map((sheet) => sheet.id);
      for (const sheetId of removeSheetIds) {
        useSheeter.getState().remove(sheetId);
      }
    });

    return unsubscribe;
  }, []);

  if (!sheets.length) return null;

  return (
    <>
      {sheets.map((sheet) => {
        // Use drawer on mobile (without container), sheet on desktop
        const SheetComponent = isMobile && !sheet.container ? SheeterDrawer : SheeterSheet;
        return <SheetComponent key={sheet.id} sheet={sheet} />;
      })}
    </>
  );
};
