import { type InternalDialog, useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { useRemoveAfterExit } from '~/modules/common/overlay-store-helpers';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';

export function DialogerDrawer({ dialog }: { dialog: InternalDialog }) {
  const { id, content, open, description, title, titleContent = title, className, headerClassName = '' } = dialog;

  const updateDialog = useDialoger((state) => state.update);

  // An open dropdown makes the drawer non-dismissible
  const isDropdownOpen = useDropdowner((state) => !!state.dropdown);

  // The drawer slides out before its entry is removed; onClose still runs as the close starts.
  const { close: closeDialog, onOpenChangeComplete } = useRemoveAfterExit(
    () => {
      updateDialog(dialog.id, { open: false, onClose: undefined });
      dialog.onClose?.();
    },
    () => useDialoger.getState().remove(dialog.id),
  );

  const onOpenChange = (open: boolean) => {
    if (open) updateDialog(dialog.id, { open });
    else closeDialog();
  };

  return (
    <Drawer key={id} open={open} disablePointerDismissal={isDropdownOpen} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
      <DrawerContent id={String(id)} className={className}>
        <DrawerHeader data-overlay="dialog" className={title || description ? headerClassName : 'hidden'}>
          {title && <DrawerTitle>{titleContent}</DrawerTitle>}
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="px-3 pb-3">{content}</div>
      </DrawerContent>
    </Drawer>
  );
}
