import { useState } from 'react';
import { useBodyClass } from '~/hooks/use-body-class';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useOnPathChange, useOverlayLock } from '~/modules/common/overlay-store-helpers';
import { SheeterDrawer } from '~/modules/common/sheeter/drawer';
import { SheeterSheet } from '~/modules/common/sheeter/sheet';
import { type InternalSheet, navSheetId, sheeter, useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { navigationStore } from '~/modules/navigation/navigation-store';

/**
 * Keeps sheets that leave the store rendered with `open: false` until Base UI reports their exit done, so every
 * close (dismiss, route change, store remove) animates out. A sheet created again with the same id takes over.
 */
function useExitingSheets(sheets: InternalSheet[], mode: string) {
  const [previous, setPrevious] = useState({ sheets, mode });
  const [exiting, setExiting] = useState<InternalSheet[]>([]);
  // keepMounted sheets that closed in place and are still sliding out: one unmounted now finishes its exit first
  const [slidingIds, setSlidingIds] = useState<string[]>([]);

  // Derived during render: in an effect the removed sheet would unmount first and remount closed, with nothing to animate.
  if (previous.sheets !== sheets || previous.mode !== mode) {
    setPrevious({ sheets, mode });
    const isLive = (sheet: InternalSheet) => sheets.some(({ id }) => id === sheet.id);
    const isClosed = (id: string) => sheets.some((sheet) => sheet.id === id && sheet.open === false);

    // A breakpoint switch remounts every overlay, so an exit in progress cannot finish
    if (previous.mode !== mode) {
      setExiting([]);
      setSlidingIds([]);
    } else {
      const closedInPlaceIds = previous.sheets.filter((sheet) => sheet.open !== false && isClosed(sheet.id)).map((sheet) => sheet.id);
      const removed = previous.sheets.filter((sheet) => !isLive(sheet) && (sheet.open !== false || slidingIds.includes(sheet.id)));
      setSlidingIds((current) => [...current.filter(isClosed), ...closedInPlaceIds]);
      setExiting((current) => [
        ...current.filter((sheet) => !isLive(sheet)),
        ...removed.map((sheet) => ({ ...sheet, open: false, onClose: undefined })),
      ]);
    }
  }

  const onExited = (id: string) => {
    setExiting((current) => current.filter((sheet) => sheet.id !== id));
    setSlidingIds((current) => current.filter((slidingId) => slidingId !== id));
  };

  return { exiting, onExited };
}

/** Renders drawers on mobile, sheets on desktop. */
export function Sheeter() {
  const isMobile = useBreakpointBelow('sm');
  const sheets = useSheeter((state) => state.sheets);
  // Part of the element keys, so crossing the breakpoint remounts the overlay
  const mode = isMobile ? 'drawer' : 'sheet';
  const { exiting, onExited } = useExitingSheets(sheets, mode);
  // A sheet sliding out no longer blocks the page (pull-to-refresh, dialog stacking)
  const hasOpenSheet = sheets.some((sheet) => sheet.open !== false);

  useOverlayLock('sheeter', hasOpenSheet);
  // Dialogs opened from a sheet stack above it through this class
  useBodyClass({ 'sheeter-open': hasOpenSheet });

  useOnPathChange(() => {
    const { navSheetOpen, keepNavOpen } = navigationStore.getState();
    sheeter.getState().removeOnRouteChange({ isCleanup: true, keepId: navSheetOpen && keepNavOpen ? navSheetId : undefined });
  });

  if (!sheets.length && !exiting.length) return null;

  return (
    <>
      {[...sheets, ...exiting].map((sheet) => {
        const SheetComponent = isMobile ? SheeterDrawer : SheeterSheet;
        return <SheetComponent key={`${sheet.id}-${mode}`} sheet={sheet} onExited={() => onExited(sheet.id)} />;
      })}
    </>
  );
}
