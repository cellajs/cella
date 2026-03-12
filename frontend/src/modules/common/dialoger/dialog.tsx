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
                open ? 'animate-in fade-in-0' : 'animate-out fade-out-0',
              )}
            />,
            container.overlayRef.current,
          )
        ) : (
          <div
            className={cn(
              'fixed inset-0 z-30 bg-background/75 duration-200',
              open ? 'animate-in fade-in-0' : 'animate-out fade-out-0',
            )}
          />
        ))}
      <DialogContent
        id={String(id)}
        container={containerElement}
        className={cn(className, containerElement && 'z-40 in-[.sheeter-open]:z-40')}
        initialFocus={isMobile ? false : undefined}
        finalFocus={triggerRef?.current ? finalFocusRef : undefined}
      >
        <DialogHeader
          sticky
          className={cn(isMobile && drawerOnMobile ? headerClassName?.replace('with-close-btn', '') : headerClassName)}
        >
          <DialogTitle className={`${title ? '' : 'hidden'} leading-6 h-6`}>{titleContent}</DialogTitle>
          <DialogDescription className={`${description ? '' : 'hidden'}`}>{description}</DialogDescription>
        </DialogHeader>

        {/* For accessibility */}
        {!title && <DialogTitle className="hidden" />}
        {content}
      </DialogContent>
    </Dialog>
  );
}
