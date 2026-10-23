import { useRef } from 'react';
import { dialoger, type InternalDialog } from '~/modules/common/dialoger/use-dialoger';
import { isDropdownOpen } from '~/modules/common/dropdowner/use-dropdowner';
import { finalFocusFor, type OverlayCloseDetails, touchInitialFocus, useRemoveAfterExit } from '~/modules/common/overlay-store-helpers';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { cn } from '~/utils/cn';
import { isHoverContentOpen } from '~/utils/is-hover-content-open';
import { tw } from '~/utils/tw';

// A phone's search dialog: at the top below the safe area, inset 0.5rem on every side, its height capped at the space
// above the keyboard (--visual-viewport-height, which SearchDialogBar writes). A flex column, so the results shrink and
// scroll while the field stays.
const searchLayoutClass = tw(
  'max-sm:data-closed:slide-out-to-top-2 max-sm:data-open:slide-in-from-top-2 max-sm:mt-[max(0.5rem,env(safe-area-inset-top))] max-sm:mb-0 max-sm:flex max-sm:max-h-[calc(var(--visual-viewport-height,100dvh)-max(0.5rem,env(safe-area-inset-top))-0.5rem)] max-sm:w-[calc(100%-1rem)] max-sm:flex-col max-sm:self-start max-sm:overflow-hidden max-sm:rounded-xl max-sm:ring-0',
);

interface DialogerDialogProps {
  dialog: InternalDialog;
}

export function DialogerDialog({ dialog }: DialogerDialogProps) {
  const {
    id,
    content,
    open,
    triggerRef,
    description,
    title,
    titleContent = title,
    outsideScroll = false,
    className,
    headerClassName,
    container,
    searchLayout,
  } = dialog;

  // A container renders the dialog inline: the page keeps scrolling and taking pointer input, focus stays in the dialog
  const inline = !!container;
  const containerElement = container?.ref?.current ?? undefined;

  const removeDialog = () => dialoger.getState().remove(dialog.id);

  // The dialog animates out before its entry (and onClose) is removed.
  const { close: closeDialog, onOpenChangeComplete } = useRemoveAfterExit(() => dialoger.getState().update(dialog.id, { open: false }), removeDialog);

  const handleOpenChange = (_nextOpen: boolean, eventDetails: OverlayCloseDetails) => {
    if (eventDetails.reason === 'escape-key' && isHoverContentOpen()) return;
    if (eventDetails.reason === 'outside-press' && (isDropdownOpen() || inline)) return;

    // URL-driven dialogs remove in the same tick, so the exit animation cannot reopen them
    if (dialog.instantClose) removeDialog();
    else closeDialog();
  };

  const popupRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} onOpenChangeComplete={onOpenChangeComplete} modal={inline ? 'trap-focus' : true}>
      {container?.overlay && (
        <div className={cn('fixed inset-0 z-30 bg-background/75 duration-200', open ? 'fade-in-0 animate-in' : 'fade-out-0 animate-out')} />
      )}
      <DialogContent
        ref={popupRef}
        id={String(id)}
        container={containerElement}
        outsideScroll={outsideScroll}
        // A drag on the inset around a search dialog would scroll the page under it: iOS scroll lock fails once its toolbar has collapsed.
        viewportClassName={searchLayout ? 'max-sm:touch-none' : undefined}
        className={cn(className, searchLayout && searchLayoutClass, containerElement && 'in-[.sheeter-open]:z-40 z-40')}
        initialFocus={touchInitialFocus(popupRef)}
        finalFocus={finalFocusFor(triggerRef, String(id))}
      >
        {/* An empty header would overlap the content, e.g. in the fullscreen attachment dialog */}
        {(title || description) && (
          <DialogHeader sticky className={headerClassName}>
            {title && <DialogTitle className="h-6 leading-6">{titleContent}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        {content}
      </DialogContent>
    </Dialog>
  );
}
