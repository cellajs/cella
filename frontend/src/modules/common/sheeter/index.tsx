import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dialog } from '~/modules/common/dialoger/state';
import MobileSheet from '~/modules/common/sheeter/drawer';
import DesktopSheet from '~/modules/common/sheeter/sheet';
import { type SheetAction, SheetObserver, type SheetT, sheet } from '~/modules/common/sheeter/state';
import { objectKeys } from '~/utils/object';

export function Sheeter() {
  const navigate = useNavigate();
  const isMobile = useBreakpoints('max', 'sm');

  const initialized = useRef(false);
  const prevFocusedElement = useRef<HTMLElement | null>(null);
  const [currentSheets, setCurrentSheets] = useState<SheetT[]>([]);

  const onOpenChange = (id: string) => (open: boolean) => {
    if (dialog.haveOpenDialogs()) return;
    if (!open) {
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
      SheetObserver.remove(id);
    }
  };

  const handleRemoveSheet = useCallback((id: string) => {
    setCurrentSheets((prevSheets) => prevSheets.filter((sheet) => sheet.id !== id));
    if (prevFocusedElement.current) setTimeout(() => prevFocusedElement.current?.focus(), 1);
  }, []);

  useEffect(() => {
    if (!initialized.current) {
      // To triggers sheets that opens on mount
      setCurrentSheets(sheet.getAll());
      initialized.current = true;
    }

    const handleAction = (action: SheetAction & SheetT) => {
      if (action.remove) handleRemoveSheet(action.id);
      else {
        prevFocusedElement.current = document.activeElement as HTMLElement;
        setCurrentSheets((prevSheets) => {
          const updatedSheets = prevSheets.filter((sheet) => sheet.id !== action.id);
          return [...updatedSheets, action];
        });
      }
    };
    return SheetObserver.subscribe(handleAction);
  }, []);

  if (!currentSheets.length) return null;

  return (
    <>
      {currentSheets.map((sheet) => {
        const SheetComponent = isMobile ? MobileSheet : DesktopSheet;
        return (
          <SheetComponent
            key={sheet.id}
            onOpenChange={onOpenChange(sheet.id)}
            title={sheet.title}
            description={sheet.text}
            content={sheet.content}
            className={sheet.className}
            {...(isMobile && { direction: 'right' })}
          />
        );
      })}
    </>
  );
}
