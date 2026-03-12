import { XIcon } from 'lucide-react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { type InternalDialog, useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
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
    className,
    showCloseButton,
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
    if (!nextOpen) closeDialog();
  };

  // Create a ref for finalFocus to focus trigger on close
  const triggerFocusRef = useLatestRef(triggerRef?.current ?? null);

  return (
    <Dialog key={id} open={open} onOpenChange={onOpenChange} modal={modal}>
      {container?.overlay && <div className="fixed inset-0 z-30 bg-background/75 animate-in fade-in-0" />}
      <DialogContent
        id={String(id)}
        showCloseButton={showCloseButton && !isMobile}
        container={containerElement}
        className={cn(className, containerElement && 'z-40 in-[.sheeter-open]:z-40')}
        initialFocus={isMobile ? false : undefined}
        finalFocus={triggerRef?.current ? triggerFocusRef : undefined}
      >
        <DialogHeader sticky className={`${title || description ? headerClassName || '' : 'hidden'}`}>
          <DialogTitle className={`${title ? '' : 'hidden'} leading-6 h-6`}>{titleContent}</DialogTitle>
          <DialogDescription className={`${description ? '' : 'hidden'}`}>{description}</DialogDescription>
          {showCloseButton && isMobile && (
            <DialogClose className="absolute right-1 top-1 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-effect">
              <XIcon className="size-5" />
              <span className="sr-only">Close</span>
            </DialogClose>
          )}
        </DialogHeader>

        {/* For accessibility */}
        {!description && !title && <DialogTitle className="hidden" />}
        {content}
      </DialogContent>
    </Dialog>
  );
}
