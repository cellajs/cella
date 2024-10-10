import { useRef } from 'react';
import StickyBox from '~/modules/common/sticky-box';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '~/modules/ui/sheet';
import { type SheetT, sheet as sheetState } from './state';
export interface SheetProp {
  sheet: SheetT;
  removeSheet: (sheet: SheetT) => void;
}

export default function DesktopSheet({ sheet, removeSheet }: SheetProp) {
  const { id, modal = true, side, open, description, title, hideClose = true, className, content } = sheet;
  const sheetRef = useRef<HTMLDivElement>(null);

  const closeSheet = () => {
    removeSheet(sheet);
    sheet.removeCallback?.();
  };

  const onOpenChange = (open: boolean) => {
    if (!modal) return;
    sheetState.update(id, { open });
    if (!open) closeSheet();
  };

  const handleEscapeKeyDown = (e: KeyboardEvent) => {
    const activeElement = document.activeElement;
    // Don't close sheet if not in modal and active element is not in sheet
    if (!modal && !sheetRef.current?.contains(activeElement)) return;
    e.preventDefault();
    e.stopPropagation();
    closeSheet();
  };

  // Close sheet if clicked outside and not in modal
  const handleInteractOutside = (event: CustomEvent<{ originalEvent: PointerEvent }> | CustomEvent<{ originalEvent: FocusEvent }>) => {
    const bodyClassList = document.body.classList;
    if (bodyClassList.contains('keep-menu-open') && bodyClassList.contains('menu-sheet-open')) return;

    const mainContentElement = document.getElementById('main-block-app-content');
    if (!modal && mainContentElement?.contains(event.target as Node)) {
      return closeSheet();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={modal}>
      <SheetContent
        ref={sheetRef}
        onEscapeKeyDown={handleEscapeKeyDown}
        onInteractOutside={handleInteractOutside}
        side={side}
        hideClose={hideClose}
        aria-describedby={undefined}
        className={`${className} items-start`}
      >
        <StickyBox className={`z-10 flex items-center justify-between bg-background py-4 ${title ? '' : 'hidden'}`}>
          <SheetTitle>{title}</SheetTitle>
        </StickyBox>
        <SheetHeader className={`${description || title ? '' : 'hidden'}`}>
          <SheetDescription className={`${description ? '' : 'hidden'}`}>{description}</SheetDescription>
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
}
