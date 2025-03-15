import { useBreakpoints } from '~/hooks/use-breakpoints';
import { type DialogData, useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';

type CustomInteractOutsideEvent = CustomEvent<{ originalEvent: PointerEvent | FocusEvent }>;

export interface DialogProp {
  dialog: DialogData;
}
export default function StandardDialog({ dialog }: DialogProp) {
  const { id, content, open, description, title, titleContent = title, className, hideClose, headerClassName = '' } = dialog;
  const isMobile = useBreakpoints('max', 'sm', false);

  const closeDialog = () => {
    useDialoger.getState().remove(dialog.id);
    dialog.removeCallback?.();
  };

  const onOpenChange = (open: boolean) => {
    useDialoger.getState().update(dialog.id, { open });
    if (!open) closeDialog();
  };

  const handleInteractOutside = (event: CustomInteractOutsideEvent) => {
    const dropDown = dropdowner.getOpenDropdown();

    // Check if there is an open dropdown and if it is not modal
    if (dropDown && !dropDown.modal) event.preventDefault();
  };

  return (
    <Dialog key={id} open={open} onOpenChange={onOpenChange} modal={true}>
      <DialogContent
        id={String(id)}
        hideClose={hideClose}
        onInteractOutside={handleInteractOutside}
        onOpenAutoFocus={(event: Event) => {
          if (isMobile) event.preventDefault();
        }}
        className={className}
      >
        <DialogHeader className={`${title || description ? headerClassName : 'hidden'}`}>
          <DialogTitle className={`${title || title ? '' : 'hidden'} leading-6 h-6`}>{titleContent}</DialogTitle>
          <DialogDescription className={`${description ? '' : 'hidden'}`}>{description}</DialogDescription>
        </DialogHeader>

        {/* For accessibility */}
        {!description && !title && <DialogTitle className="hidden" />}
        {content}
      </DialogContent>
    </Dialog>
  );
}
