import { useMemo } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { type InternalDialog, useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { cn } from '~/utils/cn';

type CustomInteractOutsideEvent = CustomEvent<{ originalEvent: PointerEvent | FocusEvent }>;

export interface DialogProp {
  dialog: InternalDialog;
}
export default function StandardDialog({ dialog }: DialogProp) {
  const { id, content, open, triggerRef, description, title, titleContent = title, className, hideClose, headerClassName, container } = dialog;
  const isMobile = useBreakpoints('max', 'sm', false);

  // When a container is provided, the dialog is rendered inside the container and scroll should stay enabled
  const modal = !container;
  // TODO use ref here?
  const containerElement = useMemo(() => (container ? document.getElementById(container.id) : null), [container]);

  // onClose trigger handles by remove method
  const closeDialog = () => useDialoger.getState().remove(dialog.id);

  const onOpenChange = (open: boolean) => {
    useDialoger.getState().update(dialog.id, { open });
    if (!open) closeDialog();
  };

  // Dont close if interact outside is caused by dropdown, and also when modal is false
  const handleInteractOutside = (event: CustomInteractOutsideEvent) => {
    const dropdown = useDropdowner.getState().dropdown;
    if (dropdown || !modal) event.preventDefault();
  };

  return (
    <Dialog key={id} open={open} onOpenChange={onOpenChange} modal={modal}>
      {container?.overlay && (
        <div className="fixed inset-0 z-30 bg-background/75 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      )}
      <DialogContent
        id={String(id)}
        hideClose={hideClose}
        container={containerElement}
        className={cn(className, containerElement && 'z-40')}
        onInteractOutside={handleInteractOutside}
        onOpenAutoFocus={(event: Event) => {
          if (isMobile) event.preventDefault();
        }}
        onCloseAutoFocus={() => {
          if (triggerRef?.current) triggerRef.current.focus();
        }}
      >
        <DialogHeader className={`${title || description ? headerClassName || '' : 'hidden'}`}>
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
