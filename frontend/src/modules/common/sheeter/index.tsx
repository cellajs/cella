import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { useBreakpoints } from '~/hooks/use-breakpoints';
import MobileSheet from '~/modules/common/sheeter/drawer';
import DesktopSheet from '~/modules/common/sheeter/sheet';
import { type SheetAction, SheetObserver, type SheetT, sheet } from '~/modules/common/sheeter/state';
import { objectKeys } from '~/utils/object';

export function Sheeter() {
  const navigate = useNavigate();
  const isMobile = useBreakpoints('max', 'sm');
  const prevFocusedElement = useRef<HTMLElement | null>(null);

  const [currentSheets, setCurrentSheets] = useState<SheetT[]>([]);

  const removeSheet = () => {
    navigate({
      to: '.',
      replace: true,
      resetScroll: false,
      search: (prev) => {
        const newSearch = { ...prev };
        for (const key of objectKeys(newSearch)) {
          if (key.includes('Preview')) delete newSearch[key];
        }
        return newSearch;
      },
    });
    sheet.remove();
  };

  useEffect(() => {
    return SheetObserver.subscribe((action: SheetAction & SheetT) => {
      if ('remove' in action) {
        setCurrentSheets((prevSheets) => prevSheets.filter((sheet) => sheet.id !== action.id));
        if (prevFocusedElement.current) setTimeout(() => prevFocusedElement.current?.focus(), 1);
        return;
      }
      prevFocusedElement.current = document.activeElement as HTMLElement;
      setCurrentSheets((prevSheets) => {
        const updatedSheets = prevSheets.filter((sheet) => sheet.id !== action.id);
        return [...updatedSheets, action];
      });
    });
  }, []);

  if (!currentSheets.length) return null;

  return (
    <>
      {currentSheets.map((sheet) => {
        const SheetComponent = isMobile ? MobileSheet : DesktopSheet;
        return <SheetComponent key={sheet.id} sheet={sheet} removeSheet={removeSheet} />;
      })}
    </>
  );
}
