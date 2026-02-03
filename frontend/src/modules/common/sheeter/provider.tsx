import { useCallback, useEffect } from 'react';
import useBodyClass from '~/hooks/use-body-class';
import { useBoundaryCleanup } from '~/hooks/use-boundary-cleanup';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { SheeterDrawer } from '~/modules/common/sheeter/drawer';
import { SheeterSheet } from '~/modules/common/sheeter/sheet';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import router from '~/routes/router';
import { useNavigationStore } from '~/store/navigation';

/**
 * Sheeter provider to render drawers on mobile, sheets on desktop.
 * When container is provided, sheets are portaled into the container element.
 * State is managed by the useSheeter zustand store hook.
 */
export const Sheeter = () => {
  const isMobile = useBreakpoints('max', 'sm');
  const sheets = useSheeter((state) => state.sheets);

  useBodyClass({ 'sheeter-open': sheets.length > 0 });

  // Close sheets that morph between drawer/sheet (no container) on resize
  const getItemsToCloseOnResize = useCallback(
    () =>
      useSheeter
        .getState()
        .sheets.filter((s) => !s.container)
        .map((s) => s.id),
    [],
  );
  const closeAll = useCallback(() => useSheeter.getState().remove(undefined, { isCleanup: true }), []);
  const closeById = useCallback(
    (id: string | number) => useSheeter.getState().remove(String(id), { isCleanup: true }),
    [],
  );

  useBoundaryCleanup(getItemsToCloseOnResize, closeAll, closeById);

  // Handle route changes (respects nav menu keepOpen preference)
  useEffect(() => {
    return router.subscribe('onBeforeLoad', ({ hrefChanged }) => {
      if (!hrefChanged) return;

      const navState = useNavigationStore.getState();
      const sheetsToClose = useSheeter.getState().sheets.filter((s) => s.closeSheetOnRouteChange !== false);
      if (!sheetsToClose.length) return;

      if (!navState.navSheetOpen || navState.navSheetOpen !== 'menu' || !navState.keepMenuOpen) {
        useSheeter.getState().removeOnRouteChange({ isCleanup: true });
        return;
      }

      // Keep nav-sheet open, close others
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
        return <SheetComponent key={sheet.id} sheet={sheet} />;
      })}
    </>
  );
};
