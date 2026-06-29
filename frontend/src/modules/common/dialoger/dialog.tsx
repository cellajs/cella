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

  // When a container is provided, the dialog is rendered inside the container and scroll should stay enabled
  const modal = !container;
  const containerElement = container?.ref?.current ?? undefined;

  // onClose trigger handles by remove method
  const closeDialog = () => useDialoger.getState().remove(dialog.id);

  const onOpenChange = (nextOpen: boolean, eventDetails: { reason: string }) => {
    // Dont close if interact outside is caused by dropdown, and also when modal is false
    if (!nextOpen && eventDetails.reason === 'outside-press') {
      const dropdown = useDropdowner.getState().dropdown;
      if (dropdown || !modal) return;
    }

    useDialoger.getState().update(dialog.id, { open: nextOpen });
    if (!nextOpen) {
      // Delay removal to allow exit animation to complete
      setTimeout(closeDialog, 200);
    }
  };

  // Create a ref for finalFocus to return focus to trigger on close
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
        {/* Only render the visible header when there is a title or description to show.
            This avoids an empty header overlapping content (e.g. fullscreen attachment dialog). */}
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

        {/* Accessibility: guarantee the dialog always has an accessible name even without a visible header */}
        {!title && !description && <DialogTitle className="hidden" />}
        {content}
      </DialogContent>
    </Dialog>
  );
}
