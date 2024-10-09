import { type DialogT, dialog as dialogState } from '~/modules/common/dialoger/state';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { cn } from '~/utils/cn';

export interface DialogProp {
  dialog: DialogT;
  removeDialog: (dialog: DialogT) => void;
}
export default function StandardDialog({ dialog, removeDialog }: DialogProp) {
  const { id, content, container, open, description, title, className, containerBackdrop, containerBackdropClassName, autoFocus, hideClose } = dialog;

  const closeDialog = () => {
    removeDialog(dialog);
    dialog.removeCallback?.();
  };
  const onOpenChange = (open: boolean) => {
    dialogState.update(dialog.id, { open });
    if (!open) closeDialog();
  };

  return (
    <Dialog key={id} open={open} onOpenChange={onOpenChange} modal={!container}>
      {container && containerBackdrop && (
        <div
          className={cn(
            'fixed inset-0 z-[100] bg-background/75 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            containerBackdropClassName,
          )}
        />
      )}
      <DialogContent
        onEscapeKeyDown={closeDialog}
        hideClose={hideClose}
        onOpenAutoFocus={(event: Event) => {
          if (!autoFocus) event.preventDefault();
        }}
        className={className}
        container={container}
      >
        <DialogHeader className={`${title || description ? '' : 'hidden'}`}>
          <DialogTitle className={`${title || title ? '' : 'hidden'} h-6`}>{title}</DialogTitle>
          <DialogDescription className={`${description ? '' : 'hidden'}`}>{description}</DialogDescription>
        </DialogHeader>

        {/* For accessibility */}
        {!description && !title && <DialogTitle className="hidden" />}
        {content}
      </DialogContent>
    </Dialog>
  );
}
