import type { Page } from 'playwright';

export interface ScopeState {
  id: string;
  /** Path on the frontend; `{org}` is replaced by the first organization of the audit user. */
  path: string;
  auth: boolean;
  /** Brings the page into the state to audit, such as an open dialog. Runs after the page has loaded. */
  open?: (page: Page) => Promise<void>;
}

/** Waits for an overlay (dialog, sheet, popover) to finish opening. */
const settle = (page: Page) => page.waitForTimeout(800);

/**
 * The sample of pages and states the audit covers (WCAG-EM steps 2 and 3): every page type, plus the overlays
 * that render outside it. An app adds its own routes and states here.
 */
export const scope: ScopeState[] = [
  // Public website
  { id: 'marketing-home', path: '/about', auth: false },
  { id: 'features', path: '/features', auth: false },
  { id: 'sync-engine', path: '/sync-engine', auth: false },
  { id: 'contact', path: '/contact', auth: false },
  { id: 'legal-privacy', path: '/legal/privacy', auth: false },
  { id: 'legal-accessibility', path: '/legal/accessibility', auth: false },

  // Docs
  { id: 'docs-overview', path: '/docs/overview', auth: false },
  { id: 'docs-operations', path: '/docs/operations', auth: false },
  { id: 'docs-schemas', path: '/docs/schemas', auth: false },
  { id: 'docs-page', path: '/docs/page/quickstart', auth: false },
  {
    id: 'docs-search',
    path: '/docs/overview',
    auth: false,
    open: async (page) => {
      await page.keyboard.press('ControlOrMeta+k');
      await settle(page);
    },
  },

  // Authentication
  { id: 'sign-in', path: '/auth/authenticate', auth: false },
  {
    id: 'sign-in-email',
    path: '/auth/authenticate',
    auth: false,
    open: async (page) => {
      await page.getByRole('textbox').first().fill('someone@example.com');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
    },
  },
  { id: 'auth-error', path: '/auth/error', auth: false },

  // App
  { id: 'home', path: '/home', auth: true },
  { id: 'account', path: '/account', auth: true },
  { id: 'org-attachments', path: '{org}/organization/attachments', auth: true },
  { id: 'org-members', path: '{org}/organization/members', auth: true },
  { id: 'org-settings', path: '{org}/organization/settings', auth: true },
  { id: 'system-users', path: '/system/users', auth: true },
  { id: 'system-organizations', path: '/system/organizations', auth: true },

  // Overlays
  {
    id: 'menu-sheet',
    path: '/home',
    auth: true,
    open: async (page) => {
      await page.keyboard.press('Shift+M');
      await settle(page);
    },
  },
  {
    id: 'search-sheet',
    path: '/home',
    auth: true,
    open: async (page) => {
      await page.keyboard.press('Shift+F');
      await settle(page);
    },
  },
  {
    id: 'account-sheet',
    path: '/home',
    auth: true,
    open: async (page) => {
      await page.keyboard.press('Shift+A');
      await settle(page);
    },
  },
  {
    id: 'invite-dialog',
    path: '{org}/organization/members',
    auth: true,
    open: async (page) => {
      await page.getByRole('button', { name: 'Invite' }).click();
      await settle(page);
      await page.getByRole('button', { name: 'Add by email' }).click();
      await settle(page);
    },
  },
  {
    id: 'member-sheet',
    path: '{org}/organization/members',
    auth: true,
    open: async (page) => {
      await page.getByRole('gridcell').getByRole('button').first().click();
      await settle(page);
    },
  },
];
