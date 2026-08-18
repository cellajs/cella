import { createPortal } from 'react-dom';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { type InternalDialog, useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { cn } from '~/utils/cn';

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

  // A container renders the dialog inline and keeps page scroll enabled
  const modal = !container;
  const containerElement = container?.ref?.current ?? undefined;

  const closeDialog = () => useDialoger.getState().remove(dialog.id);

  const onOpenChange = (nextOpen: boolean, eventDetails: { reason: string }) => {
    // An outside press landing on a dropdown must not close the dialog
    if (!nextOpen && eventDetails.reason === 'outside-press') {
      const dropdown = useDropdowner.getState().dropdown;
      if (dropdown || !modal) return;
    }

    // URL-driven dialogs remove in the same tick, so the 200ms exit gap cannot reopen them
    if (!nextOpen && dialog.instantClose) {
      closeDialog();
      return;
    }

    useDialoger.getState().update(dialog.id, { open: nextOpen });
    if (!nextOpen) {
      setTimeout(closeDialog, 200);
    }
  };

  const finalFocusRef = useLatestRef(triggerRef?.current ?? null);

  return (
    <Dialog key={id} open={open} onOpenChange={onOpenChange} modal={modal}>
      {container?.overlay &&
        (container.overlayRef?.current ? (
          createPortal(
            <div
              className={cn(
                'absolute inset-0 z-30 bg-background/75 duration-200',
                open ? 'fade-in-0 animate-in' : 'fade-out-0 animate-out',
              )}
            />,
            container.overlayRef.current,
          )
        ) : (
          <div
            className={cn(
              'fixed inset-0 z-30 bg-background/75 duration-200',
              open ? 'fade-in-0 animate-in' : 'fade-out-0 animate-out',
            )}
          />
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
          <DialogHeader
            sticky
            className={cn(
              isMobile && drawerOnMobile ? headerClassName?.replace('with-close-btn', '') : headerClassName,
            )}
          >
            {title ? (
              <DialogTitle className="h-6 leading-6">{titleContent}</DialogTitle>
            ) : (
              <DialogTitle className="hidden" />
            )}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}

        {/* Guarantee an accessible name without a visible header */}
        {!title && !description && <DialogTitle className="hidden" />}
        {content}
      </DialogContent>
    </Dialog>
  );
}
