import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useRef } from 'react';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { isDropdownOpen } from '~/modules/common/dropdowner/use-dropdowner';
import { finalFocusFor, type OverlayCloseDetails, touchInitialFocus } from '~/modules/common/overlay-store-helpers';
import { type InternalSheet, navSheetId, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '~/modules/ui/sheet';
import { cn } from '~/utils/cn';
import { isHoverContentOpen } from '~/utils/is-hover-content-open';

export function SheeterSheet({ sheet, onExited }: { sheet: InternalSheet; onExited?: () => void }) {
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
    const dialogs = dialoger.getState().dialogs.filter((d) => d.open);
    for (const dialog of dialogs) dialoger.getState().remove(dialog.id);
  };

  const onOpenChange = (_nextOpen: boolean, eventDetails: OverlayCloseDetails) => {
    if (eventDetails.reason === 'escape-key') {
      if (!closeSheetOnEsc || isHoverContentOpen()) return;
      closeSheet();
      return;
    }

    if (eventDetails.reason === 'outside-press') {
      // An outside press landing on a dropdown or dialog must not close the sheet
      if (isDropdownOpen() || dialoger.getState().dialogs.some((d) => d.open)) return;

      // The nav button's own click handler toggles the nav sheet; closing here makes it reopen
      if (sheet.id === navSheetId) {
        const navState = navigationStore.getState();
        if (navState.keepNavOpen && navState.navSheetOpen) return;

        const target = eventDetails.event?.target as Node | null;
        if (target && (target as Element).nodeType === 1) {
          const el = target as Element;
          if (el.closest('#sidebar-nav, #bottom-bar-nav')) return;
        }
      }
    }

    closeSheet();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
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
        initialFocus={touchInitialFocus(popupRef)}
        finalFocus={finalFocusFor(triggerRef, String(id))}
        autoScrollOnDrag={autoScrollOnDrag}
        keepMounted={keepMounted}
      >
        <SheetHeader sticky className={cn(headerClassName, !(title || description) && 'hidden')}>
          {title && <SheetTitle className="h-6 leading-6">{titleContent}</SheetTitle>}
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <ContentKeyTransition contentKey={contentKey}>{content}</ContentKeyTransition>
      </SheetContent>
    </Sheet>
  );
}

/** Ref callback that starts mounting content at the top of its sheet's scroll container; stable, so only mounts call it. */
function scrollToTop(element: HTMLElement | null) {
  const scroller = element?.closest('[data-slot="scroll-area-viewport"], [data-slot="drawer-content"]');
  if (scroller) scroller.scrollTop = 0;
}

/**
 * Slides in new content when `contentKey` changes; without a key the content renders as is. The old content leaves
 * first, at its own scroll position, and the new content then starts at the top.
 */
export function ContentKeyTransition({ contentKey, children }: { contentKey?: string; children: ReactNode }) {
  if (!contentKey) return children;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={contentKey}
        ref={scrollToTop}
        className="flex flex-1 flex-col"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.1 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
