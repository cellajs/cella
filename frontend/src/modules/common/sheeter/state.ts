let sheetsCounter = 1;

export type SheetT = {
  id: number | string;
  title?: string | React.ReactNode;
  text?: React.ReactNode;
  className?: string;
  content?: React.ReactNode;
};

export type SheetToRemove = {
  id: number | string;
  remove: true;
};

export type SheetToReset = {
  id: number | string;
  reset: true;
};

export type ExternalSheet = Omit<SheetT, 'id' | 'content'> & {
  id?: number | string;
};

export const isSheet = (dialog: SheetT | SheetToRemove): dialog is SheetT => {
  return !(dialog as SheetToRemove).remove;
};

class Observer {
  subscribers: Array<(sheet: SheetT | SheetToRemove | SheetToReset) => void>;
  sheets: (SheetT | SheetToRemove | SheetToReset)[];

  constructor() {
    this.subscribers = [];
    this.sheets = [];
  }

  subscribe = (subscriber: (sheet: SheetT | SheetToRemove | SheetToReset) => void) => {
    this.subscribers.push(subscriber);

    return () => {
      const index = this.subscribers.indexOf(subscriber);
      this.subscribers.splice(index, 1);
    };
  };

  publish = (data: SheetT) => {
    for (const subscriber of this.subscribers) {
      subscriber(data);
    }
  };

  get = (id: number | string) => {
    return this.sheets.find((sheet) => sheet.id === id);
  };

  set = (data: SheetT) => {
    this.publish(data);
    this.sheets = [...this.sheets, data];
  };

  remove = (id?: number | string) => {
    if (id) {
      for (const subscriber of this.subscribers) {
        subscriber({ id, remove: true });
      }

      return;
    }

    for (const sheet of this.sheets) {
      for (const subscriber of this.subscribers) {
        subscriber({ id: sheet.id, remove: true });
      }
    }
  };

  //Update sheet
  update = (id: number | string, data: Partial<SheetT>) => {
    if (!id) return;

    for (const subscriber of this.subscribers) {
      subscriber({ id, ...data });
    }

    return;
  };

  // Reset sheet
  reset = (id?: number | string) => {
    if (id) {
      for (const subscriber of this.subscribers) {
        subscriber({ id, reset: true });
      }
      return;
    }
    // Reset all sheets
    for (const dialog of this.sheets) {
      for (const subscriber of this.subscribers) {
        subscriber({ id: dialog.id, reset: true });
      }
    }
  };
}

export const SheetState = new Observer();

const sheetFunction = (content: React.ReactNode, data?: ExternalSheet) => {
  const id = data?.id || sheetsCounter++;

  SheetState.set({
    content,
    ...data,
    id,
  });
  return id;
};

export const basicSheet = sheetFunction;

export const sheet = Object.assign(basicSheet, {
  remove: SheetState.remove,
  update: SheetState.update,
  reset: SheetState.reset,
  get: SheetState.get,
});
