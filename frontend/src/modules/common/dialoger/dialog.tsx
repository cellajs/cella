import { useEffect, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { type DialogData, useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { cn } from '~/utils/cn';

type CustomInteractOutsideEvent = CustomEvent<{ originalEvent: PointerEvent | FocusEvent }>;

export interface DialogProp {
  dialog: DialogData;
}
export default function StandardDialog({ dialog }: DialogProp) {
  const { id, content, open, description, title, titleContent = title, className, hideClose, headerClassName = '', container } = dialog;
  const isMobile = useBreakpoints('max', 'sm', false);

  const [containerElement, setContainerElement] = useState<HTMLElement | null>(null);

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

  // Find container element if id provided
  useEffect(() => {
    console.log('container', container, open);
    if (!open) return;
    if (!container?.id) return;

    const c = document.getElementById(container?.id);
    if (!container) return console.warn('containerId provided but no element found.');
    setContainerElement(c);
  }, [open, container]);

  return (
    <Dialog key={id} open={open} onOpenChange={onOpenChange} modal={!containerElement}>
      {container?.overlay && (
        <div className="fixed inset-0 z-50 bg-background/75 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      )}
      <DialogContent
        container={containerElement}
        containerOverlay={container?.overlay}
        id={String(id)}
        hideClose={hideClose}
        onInteractOutside={handleInteractOutside}
        onOpenAutoFocus={(event: Event) => {
          if (isMobile) event.preventDefault();
        }}
        className={cn(className, containerElement && 'z-60')}
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
