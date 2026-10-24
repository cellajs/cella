import { dialoger, type InternalDialog, useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { OverlayCloseContext } from '~/modules/common/overlay-close';
import { useRemoveAfterExit } from '~/modules/common/overlay-store-helpers';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';

interface DialogerDrawerProps {
  dialog: InternalDialog;
}

export function DialogerDrawer({ dialog }: DialogerDrawerProps) {
  const { id, content, open, description, title, titleContent = title, className, headerClassName } = dialog;

  const updateDialog = useDialoger((state) => state.update);

  const isDropdownOpen = useDropdowner((state) => !!state.dropdown);

  // The drawer slides out before its entry is removed; onClose still runs as the close starts.
  const { close: closeDialog, onOpenChangeComplete } = useRemoveAfterExit(
    () => {
      updateDialog(dialog.id, { open: false, onClose: undefined });
      dialog.onClose?.();
    },
    () => dialoger.getState().remove(dialog.id),
  );

  return (
    <Drawer open={open} disablePointerDismissal={isDropdownOpen} onOpenChange={closeDialog} onOpenChangeComplete={onOpenChangeComplete}>
      <DrawerContent id={String(id)} data-overlay="dialog" className={className}>
        {(title || description) && (
          <DrawerHeader className={headerClassName}>
            {title && <DrawerTitle>{titleContent}</DrawerTitle>}
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
        )}
        <div className="px-3 pb-3">
          <OverlayCloseContext.Provider value={{ close: closeDialog, back: closeDialog }}>{content}</OverlayCloseContext.Provider>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
