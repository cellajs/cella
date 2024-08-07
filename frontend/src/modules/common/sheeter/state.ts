export type SheetT = {
  id: string;
  title?: string | React.ReactNode;
  text?: React.ReactNode;
  className?: string;
  content?: React.ReactNode;
};

export type SheetAction = {
  id: string;
  remove?: boolean;
};

class SheetsStateObserver {
  // Array to store the current sheets
  private sheets: SheetT[] = [];
  // Array to store subscribers that will be notified of changes
  private subscribers: Array<(action: SheetAction & SheetT) => void> = [];

  // Method to subscribe to changes
  subscribe = (callback: (action: SheetAction & SheetT) => void) => {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((sub) => sub !== callback);
    };
  };

  // Notify all subscribers of a change
  private notifySubscribers = (action: SheetAction & SheetT) => {
    for (const sub of this.subscribers) sub(action);
  };

  // Retrieve a sheet by its ID
  get = (id: string) => this.sheets.find((sheet) => sheet.id === id);

  // Retrieve a all sheets
  getAll = () => this.sheets;

  // Add or update a sheet and notify subscribers
  set = (sheet: SheetT) => {
    this.sheets = [...this.sheets.filter((s) => s.id !== sheet.id), sheet];
    this.notifySubscribers(sheet);
  };

  // Remove a sheet by its ID or clear all sheets and notify subscribers
  remove = (id?: string) => {
    if (id) {
      // Remove a specific sheet by ID
      this.sheets = this.sheets.filter((sheet) => sheet.id !== id);
      this.notifySubscribers({ id, remove: true });
    } else {
      // Remove all sheets
      for (const sheet of this.sheets) this.notifySubscribers({ id: sheet.id, remove: true });
      this.sheets = [];
    }
  };

  // Update an existing sheet or create a new one with the provided updates
  update = (id: string, updates: Partial<SheetT>, leavePrevData = true) => {
    const existingSheet = leavePrevData ? this.get(id) : undefined;
    this.set({
      id,
      ...(existingSheet ? { ...existingSheet, ...updates } : updates),
    });
  };

  // Create a new sheet with the given content and optional additional data
  create = (content: React.ReactNode, data?: Omit<SheetT, 'content'>) => {
    const id = data?.id || Date.now().toString(); // Use existing ID or generate a new one
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
  getAll: SheetObserver.getAll,
});
