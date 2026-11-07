import { useRef } from 'react';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { isDropdownOpen } from '~/modules/common/dropdowner/use-dropdowner';
import { finalFocusFor, type OverlayCloseDetails, touchInitialFocus } from '~/modules/common/overlay-store-helpers';
import { ContentKeyTransition } from '~/modules/common/sheeter/content-key-transition';
import { type InternalSheet, navSheetId, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { uploader } from '~/modules/common/uploader/use-uploader';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '~/modules/ui/sheet';
import { cn } from '~/utils/cn';
import { isHoverContentOpen } from '~/utils/is-hover-content-open';

export function SheeterSheet({ sheet, onExited }: { sheet: InternalSheet; onExited?: () => void }) {
  const { id, modal, title, titleContent = title, description, closeSheetOnEsc = true } = sheet;

  const popupRef = useRef<HTMLDivElement>(null);

  // Pinned, the page beside the sheet stays in use: a modal popup would hide that page from assistive technology
  const isPinned = useNavigationStore((state) => state.keepNavOpen) && id === navSheetId;

  // The provider keeps the removed sheet rendered until it has slid out
  const closeSheet = () => {
    sheeter.getState().remove(sheet.id);

    // Closing the sheet closes the dialogs it opened
    const dialogs = dialoger.getState().dialogs.filter((dialog) => dialog.open);
    for (const dialog of dialogs) dialoger.getState().remove(dialog.id);
  };

  const handleOpenChange = (_nextOpen: boolean, eventDetails: OverlayCloseDetails) => {
    if (eventDetails.reason === 'escape-key' && (!closeSheetOnEsc || isHoverContentOpen())) return;

    if (eventDetails.reason === 'outside-press') {
      // An outside press on a dropdown or dialog must not close the sheet, the uploader's dialog included: it isn't in the dialoger
      if (isDropdownOpen() || uploader.getState().uploadData || dialoger.getState().dialogs.some((dialog) => dialog.open)) return;

      // The nav button's own click handler toggles the nav sheet; closing here makes it reopen
      if (sheet.id === navSheetId) {
        const target = eventDetails.event?.target;
        if (target instanceof Element && target.closest('#sidebar-nav, #bottom-bar-nav')) return;
      }
    }

    closeSheet();
  };

  return (
    <Sheet
      open={sheet.open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={(isOpen) => !isOpen && onExited?.()}
      modal={isPinned ? false : modal}
      // Also what stops a non-modal popup from closing when focus leaves it
      disablePointerDismissal={isPinned || sheet.disablePointerDismissal}
    >
      <SheetContent
        ref={popupRef}
        id={String(id)}
        side={sheet.side}
        overlay={modal === true}
        className={cn('items-start', sheet.className)}
        initialFocus={() => touchInitialFocus(popupRef)}
        finalFocus={() => finalFocusFor(sheet.triggerRef, String(id))}
        autoScrollOnDrag={sheet.autoScrollOnDrag}
        keepMounted={sheet.keepMounted}
      >
        {title && (
          <SheetHeader sticky className={sheet.headerClassName}>
            <SheetTitle className="h-6 min-w-0 truncate leading-6">{titleContent}</SheetTitle>
            {sheet.titleAside}
          </SheetHeader>
        )}
        {description && <SheetDescription className="px-4 pb-4">{description}</SheetDescription>}
        <ContentKeyTransition contentKey={sheet.contentKey}>{sheet.content}</ContentKeyTransition>
      </SheetContent>
    </Sheet>
  );
}
