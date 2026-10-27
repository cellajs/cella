import { useRef } from 'react';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { isDropdownOpen } from '~/modules/common/dropdowner/use-dropdowner';
import { finalFocusFor, type OverlayCloseDetails, touchInitialFocus } from '~/modules/common/overlay-store-helpers';
import { ContentKeyTransition } from '~/modules/common/sheeter/content-key-transition';
import { type InternalSheet, navSheetId, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '~/modules/ui/sheet';
import { cn } from '~/utils/cn';
import { isHoverContentOpen } from '~/utils/is-hover-content-open';

interface SheeterSheetProps {
  sheet: InternalSheet;
  onExited?: () => void;
}

export function SheeterSheet({ sheet, onExited }: SheeterSheetProps) {
  const {
    id,
    modal,
    side,
    open,
    triggerRef,
    description,
    title,
    titleContent = title,
    headerClassName,
    className,
    content,
    closeSheetOnEsc = true,
    disablePointerDismissal,
    contentKey,
    autoScrollOnDrag,
    keepMounted,
  } = sheet;

  const popupRef = useRef<HTMLDivElement>(null);

  // The provider keeps the removed sheet rendered until it has slid out
  const closeSheet = () => {
    sheeter.getState().remove(sheet.id);

    // Closing the sheet closes the dialogs it opened
    const dialogs = dialoger.getState().dialogs.filter((dialog) => dialog.open);
    for (const dialog of dialogs) dialoger.getState().remove(dialog.id);
  };

  const handleOpenChange = (_nextOpen: boolean, eventDetails: OverlayCloseDetails) => {
    if (eventDetails.reason === 'escape-key') {
      if (!closeSheetOnEsc || isHoverContentOpen()) return;
      closeSheet();
      return;
    }

    if (eventDetails.reason === 'outside-press') {
      // An outside press on a dropdown or dialog must not close the sheet
      if (isDropdownOpen() || dialoger.getState().dialogs.some((dialog) => dialog.open)) return;

      // The nav button's own click handler toggles the nav sheet; closing here makes it reopen
      if (sheet.id === navSheetId) {
        const navState = navigationStore.getState();
        if (navState.keepNavOpen && navState.navSheetOpen) return;

        const target = eventDetails.event?.target;
        if (target instanceof Element && target.closest('#sidebar-nav, #bottom-bar-nav')) return;
      }
    }

    closeSheet();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={(isOpen) => !isOpen && onExited?.()}
      modal={modal}
      disablePointerDismissal={disablePointerDismissal}
    >
      <SheetContent
        ref={popupRef}
        id={String(id)}
        side={side}
        overlay={modal === true}
        className={cn('items-start', className)}
        initialFocus={() => touchInitialFocus(popupRef)}
        finalFocus={() => finalFocusFor(triggerRef, String(id))}
        autoScrollOnDrag={autoScrollOnDrag}
        keepMounted={keepMounted}
      >
        {(title || description) && (
          <SheetHeader sticky className={headerClassName}>
            {title && <SheetTitle className="h-6 leading-6">{titleContent}</SheetTitle>}
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
        )}
        <ContentKeyTransition contentKey={contentKey}>{content}</ContentKeyTransition>
      </SheetContent>
    </Sheet>
  );
}
