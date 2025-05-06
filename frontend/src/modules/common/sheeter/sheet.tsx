import { useEffect, useRef, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { type InternalSheet, useSheeter } from '~/modules/common/sheeter/use-sheeter';
import StickyBox from '~/modules/common/sticky-box';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '~/modules/ui/sheet';
import { useNavigationStore } from '~/store/navigation';
import { isElementInteractive } from '~/utils/is-el-interactive';

export interface SheetProps {
  sheet: InternalSheet;
}

export const DesktopSheet = ({ sheet }: SheetProps) => {
  const {
    id,
    modal,
    side: sheetSide,
    open,
    triggerRef,
    description,
    scrollableOverlay,
    title,
    titleContent = title,
    hideClose = false,
    className: sheetClassName,
    content,
    closeSheetOnEsc = true,
  } = sheet;

  const isMobile = useBreakpoints('max', 'sm', false);

  const sheetRef = useRef<HTMLDivElement>(null);

  // State to retain side value even after sheet removal
  const [side, setSide] = useState(sheetSide);
  const [className, setClassName] = useState(sheetClassName);

  // TODO(REVIEW) Prevent flickering of sheet when its removed
  useEffect(() => {
    if (sheetSide) {
      setSide(sheetSide); // Update side when new sheet is created
      setClassName(sheetClassName);
    }
  }, [sheetSide, sheetClassName]);

  // onClose trigger handles by remove method
  const closeSheet = () => {
    useSheeter.getState().remove(sheet.id);

    // Close dialogs opened in sheet with sheet close
    const dialogs = useDialoger.getState().dialogs.filter((d) => d.open);
    for (const dialog of dialogs) useDialoger.getState().remove(dialog.id);
  };

  const onOpenChange = (open: boolean) => {
    if (!modal) return;
    if (open) useSheeter.getState().update(id, { open });
    else closeSheet();
  };

  const handleEscapeKeyDown = (e: KeyboardEvent) => {
    e.preventDefault();

    // Blur active element on esc click
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && isElementInteractive(activeElement)) activeElement.blur();

    if (!closeSheetOnEsc) return;

    // if close, prevent any Esc key down listeners
    e.stopPropagation();
    closeSheet();
  };

  const handleInteractOutside = (event: CustomEvent<{ originalEvent: PointerEvent }> | CustomEvent<{ originalEvent: FocusEvent }>) => {
    // Dont close if interact outside is caused by dropdown
    const dropdown = useDropdowner.getState().dropdown;
    if (dropdown) return event.preventDefault();

    // Dont close if interact outside is caused by dialog
    const dialogs = useDialoger.getState().dialogs;
    if (dialogs.some((d) => d.open)) return event.preventDefault();

    // Nav sheet in keep open mode shouldnt close
    if (sheet.id === 'nav-sheet') {
      const navState = useNavigationStore.getState();
      navState.navSheetOpen;
      if (navState.keepMenuOpen && navState.navSheetOpen === 'menu') return event.preventDefault();
    }

    // TODO(REVIEW) Close if clicked in app content area
    const mainContentElement = document.getElementById('app-content-inner');
    if (!modal && mainContentElement?.contains(event.target as Node)) return closeSheet();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={modal}>
      <SheetContent
        id={String(id)}
        scrollableOverlay={scrollableOverlay}
        ref={sheetRef}
        side={side} // Retained side value
        hideClose={hideClose}
        aria-describedby={undefined}
        className={`${className} items-start`}
        onEscapeKeyDown={handleEscapeKeyDown}
        onInteractOutside={handleInteractOutside}
        onOpenAutoFocus={(event: Event) => {
          if (isMobile) event.preventDefault();
        }}
        onCloseAutoFocus={() => {
          if (triggerRef?.current) triggerRef.current.focus();
        }}
      >
        <StickyBox
          className={`z-10 flex items-center justify-between bg-background/50 backdrop-blur-xs py-3 [.scrollable_&]:px-3 ${title ? '' : 'hidden'}`}
        >
          <SheetTitle>{titleContent}</SheetTitle>
        </StickyBox>
        <SheetHeader className={`${description ? '' : 'hidden'}`}>
          <SheetDescription className={`${description ? '' : 'hidden'}`}>{description}</SheetDescription>
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
};
