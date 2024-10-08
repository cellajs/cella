import { useCallback, useEffect, useRef, useState } from 'react';

import { useBreakpoints } from '~/hooks/use-breakpoints';
import MobileSheet from '~/modules/common/sheeter/drawer';
import DesktopSheet from '~/modules/common/sheeter/sheet';
import { type SheetAction, SheetObserver, type SheetT } from '~/modules/common/sheeter/state';

export function Sheeter() {
  const isMobile = useBreakpoints('max', 'sm');
  const prevFocusedElement = useRef<HTMLElement | null>(null);

  const [sheets, setSheets] = useState<SheetT[]>([]);

  const removeSheet = useCallback((sheet: SheetT) => {
    setSheets((currentSheets) => currentSheets.filter(({ id }) => id !== sheet.id));
    if (prevFocusedElement.current) setTimeout(() => prevFocusedElement.current?.focus(), 1);
  }, []);

  useEffect(() => {
    return SheetObserver.subscribe((action: SheetAction & SheetT) => {
      if ('remove' in action) removeSheet(action);
      prevFocusedElement.current = (document.activeElement || document.body) as HTMLElement;
      setSheets((prevSheets) => [...prevSheets.filter((sheet) => sheet.id !== action.id), action]);
    });
  }, []);

  if (!sheets.length) return null;

  return (
    <>
      {sheets.map((sheet) => {
        const SheetComponent = isMobile ? MobileSheet : DesktopSheet;
        return <SheetComponent key={sheet.id} sheet={sheet} removeSheet={removeSheet} />;
      })}
    </>
  );
}
