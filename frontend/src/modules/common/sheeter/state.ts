export type SheetT = {
  id: string;
  title?: string | React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  content?: React.ReactNode;
  hideClose?: boolean;
  open?: boolean;
  canToggle?: boolean;
  modal?: boolean;
  side?: 'bottom' | 'top' | 'right' | 'left';
  removeCallback?: () => void;
};

export type SheetAction = {
  id: string;
  remove?: boolean;
};

class SheetsStateObserver {
  public sheets: SheetT[] = []; // Array to store the current sheets
  private subscribers: Array<(action: SheetAction & SheetT) => void> = []; // Store subscribers that will be notified of changes

  // Method to subscribe to changes
  subscribe = (subscriber: (action: SheetAction & SheetT) => void) => {
    this.subscribers.push(subscriber);
    return () => {
      this.subscribers = this.subscribers.filter((sub) => sub !== subscriber);
    };
  };

  // Notify all subscribers of a change
  private notifySubscribers = (action: SheetAction & SheetT) => {
    for (const sub of this.subscribers) sub(action);
  };

  get = (id: string) => this.sheets.find((sheet) => sheet.id === id); // Retrieve a sheet by its ID

  haveOpenSheets = () => this.sheets.filter((s) => s.open);

  // Add or update a sheet and notify subscribers
  set = (sheet: SheetT) => {
    this.sheets = [...this.sheets.filter((s) => s.id !== sheet.id), sheet];
    this.notifySubscribers(sheet);
  };

  // Remove a sheet by its ID or clear all sheets (with optionally an exluded) and notify subscribers
  remove = (id?: string, excludeId?: string) => {
    if (id) {
      this.sheets = this.sheets.filter((sheet) => sheet.id !== id);
      this.notifySubscribers({ id, remove: true });
      return;
    }
    const sheetstoRemove = this.sheets.filter((sheet) => sheet.id !== excludeId);
    for (const sheet of sheetstoRemove) this.notifySubscribers({ id: sheet.id, remove: true });
    this.sheets = excludeId ? this.sheets.filter((sheet) => sheet.id === excludeId) : [];
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
    const modal = data?.modal || true;
    const open = data?.open || true;
    const id = data?.id || Date.now().toString(); // Use existing ID or generate a new one
    this.set({ id, modal, content, open, ...data });
    return id;
  };
}

export const SheetObserver = new SheetsStateObserver();

export const sheet = {
  create: SheetObserver.create.bind(SheetObserver),
  remove: SheetObserver.remove.bind(SheetObserver),
  update: SheetObserver.update.bind(SheetObserver),
  get: SheetObserver.get.bind(SheetObserver),
  haveOpenSheets: SheetObserver.haveOpenSheets.bind(SheetObserver),
};
