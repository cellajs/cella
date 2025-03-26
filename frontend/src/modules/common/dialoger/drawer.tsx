import type { DialogProp } from '~/modules/common/dialoger/dialog';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';
import { useDropdowner } from '../dropdowner/use-dropdowner';

export default function DrawerDialog({ dialog }: DialogProp) {
  const { id, content, open, description, title, titleContent = title, className, headerClassName = '' } = dialog;

  const updateDialog = useDialoger((state) => state.update);

  // Check if dropdown is open, then disable dismissible
  const isDropdownOpen = useDropdowner((state) => state.dropdown);

  const closeDialog = () => {
    useDialoger.getState().remove(dialog.id);
    dialog.removeCallback?.();
  };

  const onOpenChange = (open: boolean) => {
    updateDialog(dialog.id, { open });
    if (!open) closeDialog();
  };

  return (
    <Drawer key={id} open={open} dismissible={!isDropdownOpen} onOpenChange={onOpenChange} onClose={closeDialog} noBodyStyles>
      <DrawerContent id={String(id)} onEscapeKeyDown={closeDialog} className={className}>
        <DrawerHeader className={`${title || description ? headerClassName : 'hidden'}`}>
          <DrawerTitle className={`${title ? '' : 'hidden'} text-left min-h-6`}>{titleContent}</DrawerTitle>
          <DrawerDescription className={`${description ? '' : 'hidden'}`}>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4">{content}</div>
      </DrawerContent>
    </Drawer>
  );
}
