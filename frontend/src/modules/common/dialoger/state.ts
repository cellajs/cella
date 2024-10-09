import type React from 'react';

let dialogsCounter = 1;

export type DialogT = {
  id: number | string;
  title?: string | React.ReactNode;
  description?: React.ReactNode;
  drawerOnMobile?: boolean;
  container?: HTMLElement | null;
  className?: string;
  refocus?: boolean;
  containerBackdrop?: boolean;
  containerBackdropClassName?: string;
  autoFocus?: boolean;
  hideClose?: boolean;
  content?: React.ReactNode;
  titleContent?: string | React.ReactNode;
  addToTitle?: boolean;
  useDefaultTitle?: boolean;
  open?: boolean;
  removeCallback?: () => void;
};

export type DialogToRemove = {
  id: number | string;
  remove: true;
  refocus?: boolean;
};

export type DialogToReset = {
  id: number | string;
  reset: true;
};

export type ExternalDialog = Omit<DialogT, 'id' | 'content'> & {
  id?: number | string;
};

export const isDialog = (dialog: DialogT | DialogToRemove): dialog is DialogT => {
  return !('remove' in dialog);
};

class Observer {
  subscribers: Array<(dialog: DialogT | DialogToRemove | DialogToReset) => void>;
  dialogs: (DialogT | DialogToRemove | DialogToReset)[];

  constructor() {
    this.subscribers = [];
    this.dialogs = [];
  }

  subscribe = (subscriber: (dialog: DialogT | DialogToRemove | DialogToReset) => void) => {
    this.subscribers.push(subscriber);

    return () => {
      const index = this.subscribers.indexOf(subscriber);
      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  };

  publish = (data: DialogT | DialogToRemove | DialogToReset) => {
    for (const subscriber of this.subscribers) subscriber(data);
  };

  set = (data: DialogT) => {
    // Check if dialog with the same id already exists
    const existingDialogIndex = this.dialogs.findIndex((dialog) => dialog.id === data.id);

    // If it exists, replace it, otherwise add it
    if (existingDialogIndex > -1) this.dialogs[existingDialogIndex] = data;
    else this.dialogs = [...this.dialogs, data];

    this.publish(data);
  };

  get = (id: number | string) => this.dialogs.find((dialog) => dialog.id === id);

  haveOpenDialogs = () => this.dialogs.some((d) => isDialog(d) && d.open);

  remove = (refocus = true, id?: number | string) => {
    if (id) {
      this.publish({ id, remove: true, refocus });
      this.dialogs = this.dialogs.filter((dialog) => dialog.id !== id);
      return;
    }
    // Remove all dialogs
    for (const dialog of this.dialogs) this.publish({ id: dialog.id, remove: true, refocus });
    this.dialogs = [];
  };

  update = (id: number | string, data: Partial<DialogT>) => {
    if (!id) return;

    const existingDialogIndex = this.dialogs.findIndex((dialog) => dialog.id === id);
    if (existingDialogIndex === -1) return;

    const updatedDialog = { ...this.dialogs[existingDialogIndex], ...data };
    this.dialogs[existingDialogIndex] = updatedDialog;
    this.publish(updatedDialog);
  };

  reset = (id?: number | string) => {
    if (id) return this.publish({ id, reset: true });

    // Reset all dialogs
    for (const dialog of this.dialogs) this.publish({ id: dialog.id, reset: true });
  };
}

export const DialogState = new Observer();

const dialogFunction = (content: React.ReactNode, data?: ExternalDialog) => {
  const id = data?.id || dialogsCounter++;

  DialogState.set({
    content,
    drawerOnMobile: true,
    refocus: true,
    autoFocus: true,
    hideClose: false,
    open: true,
    ...data,
    id,
  });
  return id;
};

export const dialog = Object.assign(dialogFunction, {
  remove: DialogState.remove,
  update: DialogState.update,
  get: DialogState.get,
  reset: DialogState.reset,
  haveOpenDialogs: DialogState.haveOpenDialogs,
});
