import { useCallback, useEffect, useRef, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';
import { DialogState, type DialogT, type DialogToRemove, type DialogToReset } from './state';

export function Dialoger() {
  const [dialogs, setDialogs] = useState<DialogT[]>([]);
  const [updatedDialogs, setUpdatedDialogs] = useState<DialogT[]>([]);
  const isMobile = useBreakpoints('max', 'sm');
  const prevFocusedElement = useRef<HTMLElement | null>(null);

  const onOpenChange = (dialog: DialogT) => (open: boolean) => {
    if (!open) removeDialog(dialog);
  };

  const removeDialog = useCallback((dialog: DialogT | DialogToRemove) => {
    setDialogs((dialogs) => dialogs.filter(({ id }) => id !== dialog.id));
    if (dialog.refocus && prevFocusedElement.current) {
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
      if ((dialog as DialogToReset).reset) {
        setUpdatedDialogs((updatedDialogs) => updatedDialogs.filter(({ id }) => id !== dialog.id));
        return;
      }
      prevFocusedElement.current = (document.activeElement || document.body) as HTMLElement;
      setUpdatedDialogs((updatedDialogs) => {
        const existingDialog = updatedDialogs.find(({ id }) => id === dialog.id);
        if (existingDialog) {
          return updatedDialogs.map((d) => (d.id === dialog.id ? dialog : d));
        }
        return [...updatedDialogs, dialog];
      });
      setDialogs((dialogs) => {
        const existingDialog = dialogs.find(({ id }) => id === dialog.id);
        if (existingDialog) {
          return dialogs;
        }
        return [...dialogs, dialog];
      });
    });
  }, []);

  if (!dialogs.length) {
    return null;
  }

  return dialogs.map((dialog) => {
    const existingDialog = updatedDialogs.find(({ id }) => id === dialog.id);

    if (!isMobile || !dialog.drawerOnMobile) {
      return (
        <Dialog key={dialog.id} open={true} onOpenChange={onOpenChange(dialog)} modal={!dialog.container}>
          {dialog.container && (
            <div className="fixed inset-0 z-[100] bg-background/75 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          )}
          <DialogContent
            hideClose={dialog.hideClose}
            onOpenAutoFocus={(event: Event) => {
              if (!dialog.autoFocus) event.preventDefault();
            }}
            className={existingDialog?.className ? existingDialog.className : dialog.className}
            container={existingDialog?.container ? existingDialog.container : dialog.container}
          >
            <DialogHeader className={`${dialog.title || dialog.text ? '' : 'hidden'}`}>
              <DialogTitle className={`${dialog.title || existingDialog?.title ? '' : 'hidden'} h-6`}>
                {existingDialog?.title
                  ? existingDialog.title
                  : dialog.title && (typeof dialog.title === 'string' ? <span>{dialog.title}</span> : dialog.title)}
              </DialogTitle>
              <DialogDescription className={`${dialog.text ? '' : 'hidden'}`}>{dialog.text}</DialogDescription>
            </DialogHeader>

            {/* For accessibility */}
            {!dialog.text && !dialog.title && <DialogTitle className="hidden" />}
            {existingDialog?.content ? existingDialog.content : dialog.content}
          </DialogContent>
        </Dialog>
      );
    }

    return (
      <Drawer key={dialog.id} open={true} onOpenChange={onOpenChange(dialog)}>
        <DrawerContent className={dialog.className}>
          {dialog.title || dialog.text ? (
            <DrawerHeader className="text-left">
              {existingDialog?.title ? (
                existingDialog.title
              ) : dialog.title ? (
                <DrawerTitle>{typeof dialog.title === 'string' ? <span>{dialog.title}</span> : dialog.title}</DrawerTitle>
              ) : null}
              {dialog.text && <DrawerDescription>{dialog.text}</DrawerDescription>}
            </DrawerHeader>
          ) : null}
          <div className="flex flex-col px-4 pb-8 gap-4">{dialog.content}</div>
        </DrawerContent>
      </Drawer>
    );
  });
}
