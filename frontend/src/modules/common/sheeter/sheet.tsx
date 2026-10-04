import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { type InternalSheet, useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
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
    container,
    contentKey,
    autoScrollOnDrag,
  } = sheet;

  const isMobile = useBreakpointBelow('sm', false);
  const containerElement = container?.ref?.current ?? null;

  // The provider keeps the removed sheet rendered until it has slid out
  const closeSheet = () => {
    useSheeter.getState().remove(sheet.id);

    // Closing the sheet closes the dialogs it opened
    const dialogs = useDialoger.getState().dialogs.filter((d) => d.open);
    for (const dialog of dialogs) useDialoger.getState().remove(dialog.id);
  };

  const onOpenChange = (nextOpen: boolean, eventDetails: { reason: string; event?: Event }) => {
    if (!nextOpen && eventDetails.reason === 'escape-key') {
      if (!closeSheetOnEsc || isHoverContentOpen()) return;
      closeSheet();
      return;
    }

    if (!nextOpen && eventDetails.reason === 'outside-press') {
      // An outside press landing on a dropdown or dialog must not close the sheet
      const dropdown = useDropdowner.getState().dropdown;
      if (dropdown) return;

      const dialogs = useDialoger.getState().dialogs;
      if (dialogs.some((d) => d.open)) return;

      // The nav button's own click handler toggles the nav sheet; closing here makes it reopen
      if (sheet.id === 'nav-sheet') {
        const navState = useNavigationStore.getState();
        if (navState.keepNavOpen && navState.navSheetOpen) return;

        const target = eventDetails.event?.target as Node | null;
        if (target && (target as Element).nodeType === 1) {
          const el = target as Element;
          if (el.closest('#sidebar-nav, #bottom-bar-nav')) return;
        }
      }

      closeSheet();
      return;
    }

    if (nextOpen) {
      if (modal) useSheeter.getState().update(id, { open: nextOpen });
    } else closeSheet();
  };

  // Resolved once the exit ends: a trigger inside a grid is replaced by a new node once cell edit mode ends. Focus that
  // left the sheet while it slid out (a focus bridge, the page after a route change) stays where it went.
  const finalFocus = triggerRef
    ? () => {
        const active = document.activeElement;
        if (active && active !== document.body && !document.getElementById(String(id))?.contains(active)) return false;
        return triggerRef.current ?? true;
      }
    : undefined;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => !isOpen && onExited?.()}
      modal={modal}
      disablePointerDismissal={disablePointerDismissal}
    >
      <SheetContent
        id={String(id)}
        side={side}
        overlay={modal === true}
        container={containerElement}
        className={cn('items-start', className, containerElement && 'z-40')}
        initialFocus={isMobile ? false : undefined}
        finalFocus={finalFocus}
        autoScrollOnDrag={autoScrollOnDrag}
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
