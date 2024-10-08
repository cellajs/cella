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
      if ('remove' in dialog) return removeDialog(dialog);

      if ('reset' in dialog) return setUpdatedDialogs((updatedDialogs) => updatedDialogs.filter(({ id }) => id !== dialog.id));

      prevFocusedElement.current = (document.activeElement || document.body) as HTMLElement;
      setUpdatedDialogs((updatedDialogs) => [...updatedDialogs.filter((d) => d.id !== dialog.id), dialog]);
      setDialogs((dialogs) => [...dialogs.filter((d) => d.id !== dialog.id), dialog]);
    });
  }, []);

  if (!dialogs.length) return null;

  return dialogs.map((dialog) => {
    const existingDialog = updatedDialogs.find(({ id }) => id === dialog.id);
    const DialogComponent = !isMobile || !dialog.drawerOnMobile ? StandardDialog : DrawerDialog;
    return <DialogComponent key={dialog.id} dialog={existingDialog ?? dialog} removeDialog={removeDialog} />;
  });
}
