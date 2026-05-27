import { AnimatePresence, motion } from 'motion/react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { type InternalSheet, useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '~/modules/ui/sheet';
import { cn } from '~/utils/cn';

export const SheeterSheet = ({ sheet }: { sheet: InternalSheet }) => {
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
    skipAnimation,
    contentKey,
    autoScrollOnDrag,
  } = sheet;

  const isMobile = useBreakpointBelow('sm', false);
  const containerElement = container?.ref?.current ?? null;

  // onClose trigger handles by remove method
  const closeSheet = () => {
    useSheeter.getState().remove(sheet.id);

    // Close dialogs opened in sheet with sheet close
    const dialogs = useDialoger.getState().dialogs.filter((d) => d.open);
    for (const dialog of dialogs) useDialoger.getState().remove(dialog.id);
  };

  const onOpenChange = (nextOpen: boolean, eventDetails: { reason: string }) => {
    // Handle escape key
    if (!nextOpen && eventDetails.reason === 'escape-key') {
      if (!closeSheetOnEsc) return;
      closeSheet();
      return;
    }

    // Handle outside press
    if (!nextOpen && eventDetails.reason === 'outside-press') {
      // Dont close if interact outside is caused by dropdown
      const dropdown = useDropdowner.getState().dropdown;
      if (dropdown) return;

      // Dont close if interact outside is caused by dialog
      const dialogs = useDialoger.getState().dialogs;
      if (dialogs.some((d) => d.open)) return;

      // Nav sheet in keep open mode shouldnt close
      if (sheet.id === 'nav-sheet') {
        const navState = useNavigationStore.getState();
        if (navState.keepNavOpen && navState.navSheetOpen) return;
      }

      closeSheet();
      return;
    }

    if (nextOpen) {
      if (modal) useSheeter.getState().update(id, { open: nextOpen });
    } else closeSheet();
  };

  // Create a ref for finalFocus to return focus to trigger on close
  const finalFocusRef = useLatestRef(triggerRef?.current ?? null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={modal} disablePointerDismissal={disablePointerDismissal}>
      <SheetContent
        id={String(id)}
        side={side}
        overlay={modal === true}
        aria-describedby={undefined}
        container={containerElement}
        className={cn(className, 'items-start', containerElement && 'z-40', skipAnimation && 'duration-0!')}
        initialFocus={isMobile ? false : undefined}
        finalFocus={triggerRef?.current ? finalFocusRef : undefined}
        autoScrollOnDrag={autoScrollOnDrag}
      >
        <SheetHeader sticky className={cn(headerClassName, !(title || description) && 'hidden')}>
          <SheetTitle className={`${title ? '' : 'hidden'} h-6 leading-6`}>{titleContent}</SheetTitle>
          <SheetDescription className={`${description ? '' : 'hidden'}`}>{description}</SheetDescription>
        </SheetHeader>
        {contentKey ? (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={contentKey}
              className="flex flex-1 flex-col"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.15 }}
            >
              {content}
            </motion.div>
          </AnimatePresence>
        ) : (
          content
        )}
      </SheetContent>
    </Sheet>
  );
};
