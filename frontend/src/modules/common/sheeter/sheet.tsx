import { useEffect, useRef, useState } from 'react';
import { type SheetData, useSheeter } from '~/modules/common/sheeter/use-sheeter';
import StickyBox from '~/modules/common/sticky-box';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '~/modules/ui/sheet';
import { isElementInteractive } from '~/utils/is-el-interactive';

export interface SheetProps {
  sheet: SheetData;
}

export const DesktopSheet = ({ sheet }: SheetProps) => {
  const {
    id,
    modal = true,
    side: sheetSide,
    open = true,
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
    useSheeter.getState().remove(sheet.id);
    sheet.removeCallback?.();
  };

  const onOpenChange = (open: boolean) => {
    if (!modal) return;
    if (open) useSheeter.getState().update(id, { open });
    else closeSheet();
  };

  const handleEscapeKeyDown = (e: KeyboardEvent) => {
    const activeElement = document.activeElement;
    if (isElementInteractive(activeElement)) return;
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
