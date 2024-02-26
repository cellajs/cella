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

export type ExternalSheet = Omit<SheetT, 'id' | 'content'> & {
  id?: number | string;
};

class Observer {
  subscribers: Array<(sheet: SheetT | SheetToRemove) => void>;
  sheets: (SheetT | SheetToRemove)[];

  constructor() {
    this.subscribers = [];
    this.sheets = [];
  }

  subscribe = (subscriber: (sheet: SheetT | SheetToRemove) => void) => {
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
});
