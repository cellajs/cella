export type SheetT = {
  id: number | string;
  title?: string | React.ReactNode;
  text?: React.ReactNode;
  className?: string;
  content?: React.ReactNode;
};

export type SheetAction = {
  id: number | string;
  remove?: boolean;
};

class SheetsStateObserver {
  private sheets: SheetT[] = [];
  private subscribers: Array<(action: SheetAction & SheetT) => void> = [];

  subscribe = (callback: (action: SheetAction & SheetT) => void) => {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((sub) => sub !== callback);
    };
  };

  private notifySubscribers = (action: SheetAction & SheetT) => {
    for (const sub of this.subscribers) sub(action);
  };

  get = (id: number | string) => this.sheets.find((sheet) => sheet.id === id);

  set = (sheet: SheetT) => {
    this.sheets = [...this.sheets.filter((s) => s.id !== sheet.id), sheet];
    this.notifySubscribers(sheet);
  };

  remove = (id?: number | string) => {
    if (id) {
      this.sheets = this.sheets.filter((sheet) => sheet.id !== id);
      this.notifySubscribers({ id, remove: true });
    } else {
      for (const sheet of this.sheets) this.notifySubscribers({ id: sheet.id, remove: true });
      this.sheets = [];
    }
  };

  update = (id: number | string, updates: Partial<SheetT>, leavePrevData = true) => {
    const existingSheet = leavePrevData ? this.get(id) : undefined;
    this.set({
      id,
      ...(existingSheet ? { ...existingSheet, ...updates } : updates),
    });
  };

  create = (content: React.ReactNode, data?: Omit<SheetT, 'content'>) => {
    const id = data?.id || Date.now();
    this.set({ id, content, ...data });
    return id;
  };
}

export const SheetObserver = new SheetsStateObserver();

export const sheet = Object.assign({
  create: SheetObserver.create,
  remove: SheetObserver.remove,
  update: SheetObserver.update,
  get: SheetObserver.get,
});
