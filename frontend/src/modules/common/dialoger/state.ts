let dialogsCounter = 1;

export type DialogT = {
  id: number | string;
  title?: string | React.ReactNode;
  description?: React.ReactNode;
  drawerOnMobile?: boolean;
  className?: string;
  content?: React.ReactNode;
};

export type DialogToRemove = {
  id: number | string;
  remove: true;
};

export type ExternalDialog = Omit<DialogT, 'id' | 'content'> & {
  id?: number | string;
};

class Observer {
  subscribers: Array<(dialog: DialogT | DialogToRemove) => void>;
  dialogs: (DialogT | DialogToRemove)[];

  constructor() {
    this.subscribers = [];
    this.dialogs = [];
  }

  subscribe = (subscriber: (dialog: DialogT | DialogToRemove) => void) => {
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

  remove = (id?: number | string) => {
    if (id) {
      for (const subscriber of this.subscribers) {
        subscriber({ id, remove: true });
      }

      return;
    }

    for (const dialog of this.dialogs) {
      for (const subscriber of this.subscribers) {
        subscriber({ id: dialog.id, remove: true });
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
    ...data,
    id,
  });
  return id;
};

export const basicDialog = dialogFunction;

export const dialog = Object.assign(basicDialog, {
  remove: DialogState.remove,
});
