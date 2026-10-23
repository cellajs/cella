import { useRef } from 'react';
import { dialoger, type InternalDialog } from '~/modules/common/dialoger/use-dialoger';
import { isDropdownOpen } from '~/modules/common/dropdowner/use-dropdowner';
import { finalFocusFor, type OverlayCloseDetails, touchInitialFocus, useRemoveAfterExit } from '~/modules/common/overlay-store-helpers';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { cn } from '~/utils/cn';
import { isHoverContentOpen } from '~/utils/is-hover-content-open';

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
        className={cn(className, containerElement && 'in-[.sheeter-open]:z-40 z-40')}
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
