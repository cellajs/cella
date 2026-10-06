import type { Page } from 'playwright';

export interface ScopeState {
  id: string;
  /** Path on the frontend; a `{name}` placeholder takes the value its resolver in `scope-config.ts` returns. */
  path: string;
  auth: boolean;
  /** Brings the page into the state to audit, such as an open dialog. Runs after the page has loaded. */
  open?: (page: Page) => Promise<void>;
  /** `open` leaves an overlay (dialog, sheet, menu) open that holds focus until it closes. */
  overlay?: true;
}

/** Overlays that hold focus while open. Toasts render as dialogs but never take focus. */
export const overlaySelector =
  '[role="dialog"]:not([data-slot^="toast"]), [role="alertdialog"]:not([data-slot^="toast"]), [role="menu"], [role="listbox"]';

/** Opens the state's overlay again when a check (a resize, an Escape) closed it. */
export async function ensureOpen(page: Page, state: ScopeState) {
  if (!state.overlay || !state.open || (await page.locator(overlaySelector).count())) return;
  await state.open(page);
}

/** Calls a backend path as the audit user and returns the parsed JSON; `init` turns the read into a write. */
export type AuditApi = <T>(apiPath: string, init?: { method: 'PUT' | 'POST'; body: unknown }) => Promise<T>;

export { scope } from '../scope-config.ts';
