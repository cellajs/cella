import { useEffect, useRef, useState } from 'react';
import StickyBox from '~/modules/common/sticky-box';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '~/modules/ui/sheet';
import { type SheetData, useSheeter } from './use-sheeter';

export interface SheetProps {
  sheet: SheetData;
  removeSheet: (sheet: SheetData) => void;
}

export const DesktopSheet = ({ sheet, removeSheet }: SheetProps) => {
  const {
    id,
    modal = true,
    side: sheetSide,
    open,
    description,
    scrollableOverlay,
    title,
    titleContent = title,
    hideClose = false,
    className: sheetClassName,
    content,
  } = sheet;
  const sheetRef = useRef<HTMLDivElement>(null);

  // State to retain side value even after sheet removal
  const [side, setSide] = useState(sheetSide);
  const [className, setClassName] = useState(sheetClassName);

  // Prevent flickering of sheet when its removed
  useEffect(() => {
    if (sheetSide) {
      setSide(sheetSide); // Update side when new sheet is created
      setClassName(sheetClassName);
    }
  }, [sheetSide, sheetClassName]);

  const closeSheet = () => {
    removeSheet(sheet);
    sheet.removeCallback?.();
  };

  const onOpenChange = (open: boolean) => {
    if (!modal) return;
    useSheeter.getState().update(id, { open });
    if (!open) closeSheet();
  };

  const handleEscapeKeyDown = (e: KeyboardEvent) => {
    const activeElement = document.activeElement;
    if (!modal && !sheetRef.current?.contains(activeElement)) return;
    e.preventDefault();
    e.stopPropagation();
    closeSheet();
  };

  // Close sheet when clicking outside also when modal is false
  const handleInteractOutside = (event: CustomEvent<{ originalEvent: PointerEvent }> | CustomEvent<{ originalEvent: FocusEvent }>) => {
    const bodyClassList = document.body.classList;
    if (bodyClassList.contains('keep-menu-open') && bodyClassList.contains('menu-sheet-open')) return;

    const mainContentElement = document.getElementById('app-content-inner');
    if (!modal && mainContentElement?.contains(event.target as Node)) return closeSheet();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={modal}>
      <SheetContent
        id={String(id)}
        scrollableOverlay={scrollableOverlay}
        ref={sheetRef}
        onEscapeKeyDown={handleEscapeKeyDown}
        onInteractOutside={handleInteractOutside}
        side={side} // Retained side value
        hideClose={hideClose}
        aria-describedby={undefined}
        className={`${className} items-start`}
      >
        <StickyBox className={`z-10 flex items-center justify-between bg-background py-3 ${title ? '' : 'hidden'}`}>
          <SheetTitle>{titleContent}</SheetTitle>
        </StickyBox>
        <SheetHeader className={`${description || title ? '' : 'hidden'}`}>
          <SheetDescription className={`${description ? '' : 'hidden'}`}>{description}</SheetDescription>
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
};
