import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/components/ui/drawer';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { DialogState, DialogT, DialogToRemove } from './state';

export function Dialoger() {
  const [open] = useState(true);
  const [dialogs, setDialogs] = useState<DialogT[]>([]);
  const isMobile = useBreakpoints('max', 'sm');

  const onOpenChange = (dialog: DialogT) => (open: boolean) => {
    if (!open) {
      removeDialog(dialog);
    }
  };

  const removeDialog = useCallback((dialog: DialogT) => setDialogs((dialogs) => dialogs.filter(({ id }) => id !== dialog.id)), []);

  useEffect(() => {
    return DialogState.subscribe((dialog) => {
      if ((dialog as DialogToRemove).remove) {
        setDialogs((dialogs) => dialogs.filter((d) => d.id !== dialog.id));
        return;
      }
      setDialogs((dialogs) => [...dialogs, dialog]);
    });
  }, []);

  if (!dialogs.length) {
    return null;
  }

  return dialogs.map((dialog) => {
    if (!isMobile || !dialog.drawerOnMobile) {
      return (
        <Dialog key={dialog.id} open={open} onOpenChange={onOpenChange(dialog)}>
          <DialogContent className={dialog.className}>
            {dialog.title || dialog.description ? (
              <DialogHeader>
                {dialog.title && <DialogTitle>{dialog.title}</DialogTitle>}
                {dialog.description && <DialogDescription>{dialog.description}</DialogDescription>}
              </DialogHeader>
            ) : null}
            {dialog.content}
          </DialogContent>
        </Dialog>
      );
    }

    return (
      <Drawer key={dialog.id} open={open} onOpenChange={onOpenChange(dialog)}>
        <DrawerContent className={dialog.className}>
          {dialog.title || dialog.description ? (
            <DrawerHeader className="text-left">
              {dialog.title && <DrawerTitle>{dialog.title}</DrawerTitle>}
              {dialog.description && <DrawerDescription>{dialog.description}</DrawerDescription>}
            </DrawerHeader>
          ) : null}
          <div className="flex flex-col px-4 pb-8 gap-4">{dialog.content}</div>
        </DrawerContent>
      </Drawer>
    );
  });
}
