import { useEffect, useState } from 'react';
import { useBodyClass } from '~/hooks/use-body-class';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useOverlayLock } from '~/modules/common/overlay-store-helpers';
import { SheeterDrawer } from '~/modules/common/sheeter/drawer';
import { SheeterSheet } from '~/modules/common/sheeter/sheet';
import { type InternalSheet, useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { getRouter } from '~/routes/-router-instance';

/**
 * Keeps sheets that leave the store rendered with `open: false` until Base UI reports their exit done, so every
 * close (dismiss, route change, store remove) animates out. A sheet created again with the same id takes over.
 */
function useExitingSheets(sheets: InternalSheet[], mode: string) {
  const [seen, setSeen] = useState({ sheets, mode });
  const [exiting, setExiting] = useState<InternalSheet[]>([]);

  // Derived during render: in an effect the removed sheet would unmount first and remount closed, with nothing to animate.
  if (seen.sheets !== sheets || seen.mode !== mode) {
    setSeen({ sheets, mode });
    const isLive = (sheet: InternalSheet) => sheets.some((s) => s.id === sheet.id);

    // A breakpoint switch remounts every overlay, so an exit in progress cannot finish
    if (seen.mode !== mode) setExiting([]);
    else {
      const removed = seen.sheets.filter((s) => s.open !== false && !isLive(s));
      setExiting((current) => [...current.filter((s) => !isLive(s)), ...removed.map((s) => ({ ...s, open: false, onClose: undefined }))]);
    }
  }

  const onExited = (id: string) => setExiting((current) => current.filter((s) => s.id !== id));

  return { exiting, onExited };
}

/**
 * Renders drawers on mobile, sheets on desktop; when `container` is provided, sheets are portaled into it.
 */
export function Sheeter() {
  const isMobile = useBreakpointBelow('sm');
  const sheets = useSheeter((state) => state.sheets);
  // Part of the element keys, so crossing the breakpoint remounts the overlay
  const mode = isMobile ? 'drawer' : 'sheet';
  const { exiting, onExited } = useExitingSheets(sheets, mode);
  // A sheet sliding out no longer blocks the page (pull-to-refresh, dialog stacking)
  const hasOpenSheet = sheets.some((s) => s.open !== false);

  useOverlayLock('sheeter', hasOpenSheet);
  // Dialogs opened from a sheet stack above it through this class
  useBodyClass({ 'sheeter-open': hasOpenSheet });

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

  if (!sheets.length && !exiting.length) return null;

  return (
    <>
      {[...sheets, ...exiting].map((sheet) => {
        const SheetComponent = isMobile && !sheet.container ? SheeterDrawer : SheeterSheet;
        return <SheetComponent key={`${sheet.id}-${mode}`} sheet={sheet} onExited={() => onExited(sheet.id)} />;
      })}
    </>
  );
}
