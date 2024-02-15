import { useCallback, useEffect, useRef, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';
import { DialogState, DialogT, DialogToRemove } from './state';

export function Dialoger() {
  const [open] = useState(true);
  const [dialogs, setDialogs] = useState<DialogT[]>([]);
  const isMobile = useBreakpoints('max', 'sm');
  const prevFocusedElement = useRef<HTMLElement | null>(null);

  const onOpenChange = (dialog: DialogT) => (open: boolean) => {
    if (!open) {
      removeDialog(dialog);
    }
  };

  const removeDialog = useCallback((dialog: DialogT | DialogToRemove) => {
    setDialogs((dialogs) => dialogs.filter(({ id }) => id !== dialog.id));
    if (prevFocusedElement.current) {
      // Timeout is needed to prevent focus from being stolen by the dialog that was just removed
      setTimeout(() => {
        prevFocusedElement.current?.focus();
        prevFocusedElement.current = null;
      }, 1);
    }
  }, []);

  useEffect(() => {
    return DialogState.subscribe((dialog) => {
      if ((dialog as DialogToRemove).remove) {
        removeDialog(dialog as DialogT);
        return;
      }
      prevFocusedElement.current = (document.activeElement || document.body) as HTMLElement;
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
