import type React from 'react';

let dialogsCounter = 1;

export type DialogT = {
  id: number | string;
  title?: string | React.ReactNode;
  text?: React.ReactNode;
  drawerOnMobile?: boolean;
  container?: HTMLElement | null;
  className?: string;
  refocus?: boolean;
  autoFocus?: boolean;
  hideClose?: boolean;
  content?: React.ReactNode;
  titleContent?: string | React.ReactNode;
  addToTitle?: boolean;
  useDefaultTitle?: boolean;
  open?: boolean;
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
  return !(dialog as DialogToRemove).remove;
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
      this.subscribers.splice(index, 1);
    };
  };

  publish = (data: DialogT) => {
    for (const subscriber of this.subscribers) {
      subscriber(data);
    }
  };

  set = (data: DialogT) => {
    this.publish(data);
    this.dialogs = [...this.dialogs, data];
  };

  get = (id: number | string) => {
    return this.dialogs.find((dialog) => dialog.id === id);
  };

  haveOpenDialogs = () => {
    return this.dialogs.some((d) => (d as DialogT).open);
  };

  remove = (refocus = true, id?: number | string) => {
    if (id) {
      for (const subscriber of this.subscribers) {
        subscriber({ id, remove: true, refocus });
      }

      return;
    }

    // Remove all dialogs
    for (const dialog of this.dialogs) {
      for (const subscriber of this.subscribers) {
        subscriber({ id: dialog.id, remove: true, refocus });
      }
    }
  };

  //Update dialog
  update = (id: number | string, data: Partial<DialogT>) => {
    if (!id) return;

    const existingDialog = this.dialogs.find((dialog) => dialog.id === id);
    if (!existingDialog) return;

    const updatedDialog = { ...existingDialog, ...data };

    for (const subscriber of this.subscribers) {
      subscriber(updatedDialog);
    }

    this.dialogs = this.dialogs.map((dialog) => (dialog.id === id ? updatedDialog : dialog));
    return;
  };

  //Reset dialog
  reset = (id?: number | string) => {
    if (id) {
      for (const subscriber of this.subscribers) {
        subscriber({ id, reset: true });
      }

      return;
    }

    // Reset all dialogs
    for (const dialog of this.dialogs) {
      for (const subscriber of this.subscribers) {
        subscriber({ id: dialog.id, reset: true });
      }
    }
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
