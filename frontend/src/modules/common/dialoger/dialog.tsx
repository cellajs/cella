import type { DialogT } from '~/modules/common/dialoger/state';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';

export interface DialogProp {
  dialog: DialogT;
  onOpenChange: () => void;
}
export default function StandardDialog({ dialog, onOpenChange }: DialogProp) {
  const { id, content, container, description, title, className, containerBackdrop, autoFocus, hideClose } = dialog;

  return (
    <Dialog key={id} open={true} onOpenChange={onOpenChange} modal={!container}>
      {container && containerBackdrop && (
        <div className="fixed inset-0 z-[100] bg-background/75 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      )}
      <DialogContent
        onInteractOutside={(e) => {
          if (container && !containerBackdrop) e.preventDefault();
        }}
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
