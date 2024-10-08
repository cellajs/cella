import type { DialogProp } from '~/modules/common/dialoger/dialog';
import { dialog as dialogState } from '~/modules/common/dialoger/state';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';

export default function DrawerDialog({ dialog, removeDialog }: DialogProp) {
  const { id, content, open, description, title, className } = dialog;

  const onOpenChange = (open: boolean) => {
    dialogState.update(dialog.id, { open });
    if (!open) {
      removeDialog(dialog);
      dialog.removeCallback?.();
    }
  };

  return (
    <Drawer key={id} open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={className}>
        <DrawerHeader className={`${title || description ? '' : 'hidden'}`}>
          <DrawerTitle className={`${title ? '' : 'hidden'} text-left h-6`}>{title}</DrawerTitle>
          <DrawerDescription className={`${description ? '' : 'hidden'}`}>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4">{content}</div>
      </DrawerContent>
    </Drawer>
  );
}
