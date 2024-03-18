import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetPortal, SheetTitle } from '~/modules/ui/sheet';
import { SheetState, type SheetT, type SheetToRemove } from './state';

export function Sheeter() {
  const { t } = useTranslation();
  const [open] = useState(true);
  const [sheets, setSheets] = useState<SheetT[]>([]);
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
      prevFocusedElement.current = (document.activeElement || document.body) as HTMLElement;
      setSheets((sheets) => [...sheets, sheet]);
    });
  }, []);

  if (!sheets.length) {
    return null;
  }

  return sheets.map((sheet) => {
    return (
      <Sheet key={sheet.id} open={open} onOpenChange={onOpenChange(sheet)} modal={true}>
        <SheetPortal>
          <SheetContent className={sheet.className}>
            {sheet.title || sheet.text ? (
              <SheetHeader className="text-left">
                {sheet.title && <SheetTitle>{sheet.title}</SheetTitle>}
                {sheet.text && <SheetDescription>{sheet.text}</SheetDescription>}
              </SheetHeader>
            ) : null}
            {sheet.content}
            <SheetClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
              <X className="h-6 w-6" />
              <span className="sr-only">{t('common:close')}</span>
            </SheetClose>
          </SheetContent>
        </SheetPortal>
      </Sheet>
    );
  });
}
