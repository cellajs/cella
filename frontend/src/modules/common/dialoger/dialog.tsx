import { createPortal } from 'react-dom';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { type InternalDialog, useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { useRemoveAfterExit } from '~/modules/common/overlay-store-helpers';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { cn } from '~/utils/cn';
import { isHoverContentOpen } from '~/utils/is-hover-content-open';

export function DialogerDialog({ dialog }: { dialog: InternalDialog }) {
  const {
    id,
    content,
    open,
    triggerRef,
    description,
    title,
    titleContent = title,
    drawerOnMobile = true,
    outsideScroll = false,
    className,
    headerClassName,
    container,
  } = dialog;
  const isMobile = useBreakpointBelow('sm', false);

  // A container renders the dialog inline: the page keeps scrolling and taking pointer input, focus stays in the dialog
  const inline = !!container;
  const containerElement = container?.ref?.current ?? undefined;

  const removeDialog = () => useDialoger.getState().remove(dialog.id);

  // The dialog animates out before its entry (and onClose) is removed.
  const { close: closeDialog, onOpenChangeComplete } = useRemoveAfterExit(
    () => useDialoger.getState().update(dialog.id, { open: false }),
    removeDialog,
  );

  const onOpenChange = (nextOpen: boolean, eventDetails: { reason: string }) => {
    if (!nextOpen && eventDetails.reason === 'escape-key' && isHoverContentOpen()) return;

    // An outside press landing on a dropdown must not close the dialog
    if (!nextOpen && eventDetails.reason === 'outside-press') {
      const dropdown = useDropdowner.getState().dropdown;
      if (dropdown || inline) return;
    }

    // URL-driven dialogs remove in the same tick, so the exit animation cannot reopen them
    if (!nextOpen && dialog.instantClose) {
      removeDialog();
      return;
    }

    if (nextOpen) useDialoger.getState().update(dialog.id, { open: true });
    else closeDialog();
  };

  const finalFocusRef = useLatestRef(triggerRef?.current ?? null);

  return (
    <Dialog key={id} open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete} modal={inline ? 'trap-focus' : true}>
      {container?.overlay &&
        (container.overlayRef?.current ? (
          createPortal(
            <div className={cn('absolute inset-0 z-30 bg-background/75 duration-200', open ? 'fade-in-0 animate-in' : 'fade-out-0 animate-out')} />,
            container.overlayRef.current,
          )
        ) : (
          <div className={cn('fixed inset-0 z-30 bg-background/75 duration-200', open ? 'fade-in-0 animate-in' : 'fade-out-0 animate-out')} />
        ))}
      <DialogContent
        id={String(id)}
        container={containerElement}
        outsideScroll={outsideScroll}
        className={cn(className, containerElement && 'in-[.sheeter-open]:z-40 z-40')}
        initialFocus={isMobile ? false : undefined}
        finalFocus={triggerRef?.current ? finalFocusRef : undefined}
      >
        {/* An empty header would overlap the content, e.g. in the fullscreen attachment dialog */}
        {(title || description) && (
          <DialogHeader sticky className={cn(isMobile && drawerOnMobile ? headerClassName?.replace('with-close-btn', '') : headerClassName)}>
            {title && <DialogTitle className="h-6 leading-6">{titleContent}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        {content}
      </DialogContent>
    </Dialog>
  );
}
