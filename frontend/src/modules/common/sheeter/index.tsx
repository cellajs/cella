import { useNavigate } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { objectKeys } from '~/lib/object';
import { dialog } from '~/modules/common/dialoger/state';
import { type SheetAction, SheetObserver, type SheetT, sheet } from '~/modules/common/sheeter/state';
import StickyBox from '~/modules/common/sticky-box';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetPortal, SheetTitle } from '~/modules/ui/sheet';

export function Sheeter() {
  const { t } = useTranslation();
  const initialized = useRef(false);
  const [currentSheets, setCurrentSheets] = useState<SheetT[]>([]);
  const prevFocusedElement = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
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
      {currentSheets.map((sheet) => (
        <Sheet key={sheet.id} open={true} onOpenChange={onOpenChange(sheet.id)} modal>
          <SheetPortal>
            <SheetContent aria-describedby={undefined} className={`${sheet.className} items-start`}>
              <StickyBox className={`z-10 flex items-center justify-between bg-background py-4 ${sheet.title ? '' : 'hidden'}`}>
                <SheetTitle>{sheet.title}</SheetTitle>
                <SheetClose className="mr-1 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none">
                  <X size={24} strokeWidth={1.25} />
                  <span className="sr-only">{t('common:close')}</span>
                </SheetClose>
              </StickyBox>
              <SheetHeader className={`${sheet.text || sheet.title ? '' : 'hidden'}`}>
                <SheetDescription className={`${sheet.text ? '' : 'hidden'}`}>{sheet.text}</SheetDescription>
              </SheetHeader>
              {sheet.content}
            </SheetContent>
          </SheetPortal>
        </Sheet>
      ))}
    </>
  );
}
