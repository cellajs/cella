import { useEffect } from 'react';
import { useBodyClass } from '~/hooks/use-body-class';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { SheeterDrawer } from '~/modules/common/sheeter/drawer';
import { SheeterSheet } from '~/modules/common/sheeter/sheet';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { useUIStore } from '~/modules/ui/ui-store';
import { getRouter } from '~/routes/-router-instance';

/**
 * Renders drawers on mobile, sheets on desktop; when `container` is provided, sheets are portaled into it.
 */
export function Sheeter() {
  const isMobile = useBreakpointBelow('sm');
  const sheets = useSheeter((state) => state.sheets);
  // Part of the element keys, so crossing the breakpoint remounts the overlay
  const mode = isMobile ? 'drawer' : 'sheet';
  const { lockUI, unlockUI } = useUIStore();

  useBodyClass({ 'sheeter-open': sheets.length > 0 });

  useEffect(() => {
    if (sheets.length > 0) {
      lockUI('sheeter');
      return () => unlockUI('sheeter');
    }
  }, [sheets.length > 0]);

  useEffect(() => {
    return getRouter().subscribe('onBeforeLoad', ({ pathChanged }) => {
      if (!pathChanged) return;

      const navState = useNavigationStore.getState();
      const sheetsToClose = useSheeter.getState().sheets.filter((s) => s.closeSheetOnRouteChange !== false);
      if (!sheetsToClose.length) return;

      if (!navState.navSheetOpen || !navState.keepNavOpen) {
        useSheeter.getState().removeOnRouteChange({ isCleanup: true });
        return;
      }

      for (const sheet of sheetsToClose.filter((s) => s.id !== 'nav-sheet')) {
        useSheeter.getState().remove(sheet.id, { isCleanup: true });
      }
    });
  }, []);

  if (!sheets.length) return null;

  return (
    <>
      {sheets.map((sheet) => {
        const SheetComponent = isMobile && !sheet.container ? SheeterDrawer : SheeterSheet;
        return <SheetComponent key={`${sheet.id}-${mode}`} sheet={sheet} />;
      })}
    </>
  );
}
