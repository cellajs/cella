import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetPortal, SheetTitle } from '~/modules/ui/sheet';
import { SheetState, type SheetToReset, type SheetT, type SheetToRemove } from './state';

export function Sheeter() {
  const { t } = useTranslation();
  const [open] = useState(true);
  const [sheets, setSheets] = useState<SheetT[]>([]);
  const [updatedSheets, setUpdatedSheets] = useState<SheetT[]>([]);
  const prevFocusedElement = useRef<HTMLElement | null>(null);

  const onOpenChange = (sheet: SheetT) => (open: boolean) => {
    if (!open) {
      removeSheet(sheet);
    }
  };

  const removeSheet = useCallback((sheet: SheetT | SheetToRemove) => {
    setSheets((sheets) => sheets.filter(({ id }) => id !== sheet.id));
    if (prevFocusedElement.current) {
      // Timeout is needed to prevent focus from being stolen by the sheet that was just removed
      setTimeout(() => {
        prevFocusedElement.current?.focus();
        prevFocusedElement.current = null;
      }, 1);
    }
  }, []);

  useEffect(() => {
    return SheetState.subscribe((sheet) => {
      if ((sheet as SheetToRemove).remove) {
        removeSheet(sheet as SheetT);
        return;
      }
      if ((sheet as SheetToReset).reset) {
        setUpdatedSheets((updatedSheets) => updatedSheets.filter(({ id }) => id !== sheet.id));
        return;
      }

      prevFocusedElement.current = (document.activeElement || document.body) as HTMLElement;
      setUpdatedSheets((updatedSheets) => {
        const existingSheet = updatedSheets.find(({ id }) => id === sheet.id);
        if (existingSheet) {
          return updatedSheets.map((s) => (s.id === sheet.id ? sheet : s));
        }
        return [...updatedSheets, sheet];
      });
      setSheets((sheets) => {
        const existingSheet = sheets.find(({ id }) => id === sheet.id);
        if (existingSheet) return sheets;
        return [...sheets, sheet];
      });
    });
  }, []);

  if (!sheets.length) {
    return null;
  }

  return sheets.map((sheet) => {
    const existingSheet = updatedSheets.find(({ id }) => id === sheet.id);
    return (
      <Sheet key={sheet.id} open={open} onOpenChange={onOpenChange(sheet)} modal={true}>
        <SheetPortal>
          <SheetContent className={sheet.className}>
            {sheet.title || sheet.text ? (
              <SheetHeader>
                {existingSheet?.title ? (
                  <SheetTitle>{existingSheet.title}</SheetTitle>
                ) : sheet.title ? (
                  <SheetTitle>{typeof sheet.title === 'string' ? <span>{sheet.title}</span> : sheet.title}</SheetTitle>
                ) : null}
                {sheet.text && <SheetDescription>{sheet.text}</SheetDescription>}
              </SheetHeader>
            ) : null}
            {sheet.content}
            <SheetClose className="absolute right-4 top-5 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
              <X size={24} strokeWidth={1.25} />
              <span className="sr-only">{t('common:close')}</span>
            </SheetClose>
          </SheetContent>
        </SheetPortal>
      </Sheet>
    );
  });
}
