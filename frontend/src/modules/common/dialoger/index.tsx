import { useCallback, useEffect, useRef, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import StandardDialog from '~/modules/common/dialoger/dialog';
import DrawerDialog from '~/modules/common/dialoger/drawer';
import { DialogState, type DialogT, type DialogToRemove } from '~/modules/common/dialoger/state';

export function Dialoger() {
  const [dialogs, setDialogs] = useState<DialogT[]>([]);
  const [updatedDialogs, setUpdatedDialogs] = useState<DialogT[]>([]);
  const isMobile = useBreakpoints('max', 'sm');
  const prevFocusedElement = useRef<HTMLElement | null>(null);

  const updateDialog = (dialog: DialogT, open: boolean) => {
    DialogState.update(dialog.id, { open });
    if (!open) {
      removeDialog(dialog);
      dialog.removeCallback?.();
    }
  };
  const onOpenChange = (dialog: DialogT) => (open: boolean) => {
    updateDialog(dialog, open);
  };

  const removeDialog = useCallback((dialog: DialogT | DialogToRemove) => {
    DialogState.update(dialog.id, { open: false });
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
      if ('remove' in dialog) {
        removeDialog(dialog);
        return;
      }
      if ('reset' in dialog) {
        setUpdatedDialogs((updatedDialogs) => updatedDialogs.filter(({ id }) => id !== dialog.id));
        return;
      }
      prevFocusedElement.current = (document.activeElement || document.body) as HTMLElement;
      setUpdatedDialogs((updatedDialogs) => {
        const existingDialog = updatedDialogs.find(({ id }) => id === dialog.id);
        if (existingDialog) return updatedDialogs.map((d) => (d.id === dialog.id ? dialog : d));

        return [...updatedDialogs, dialog];
      });
      setDialogs((dialogs) => {
        const existingDialog = dialogs.find(({ id }) => id === dialog.id);
        if (existingDialog) return dialogs;
        return [...dialogs, dialog];
      });
    });
  }, []);

  if (!dialogs.length) return null;

  return dialogs.map((dialog) => {
    const existingDialog = updatedDialogs.find(({ id }) => id === dialog.id);
    const DialogComponent = !isMobile || !dialog.drawerOnMobile ? StandardDialog : DrawerDialog;
    return <DialogComponent key={dialog.id} dialog={existingDialog ?? dialog} onOpenChange={() => onOpenChange(dialog)} />;
  });
}
