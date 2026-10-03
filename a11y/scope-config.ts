import type { AuditApi, ScopeState } from './src/scope.ts';
import { settle } from './src/session.ts';

/**
 * Brings the audit user into the state the pages below expect, before the first visit. A freshly seeded user has not
 * finished onboarding, and `/home` then redirects to the welcome page.
 */
export const prepare = async (api: AuditApi) => {
  const { user } = await api<{ user: { userFlags: { finishedOnboarding?: boolean } } }>('/me');
  if (!user.userFlags.finishedOnboarding) await api('/me', { method: 'PUT', body: { userFlags: { finishedOnboarding: true } } });
};

/**
 * Values for the `{name}` placeholders in the paths below, read from the API as the audit user before the first visit.
 * A resolver that returns null skips nothing by itself: a state whose path needs the value fails with a clear message.
 */
export const placeholders: Record<string, (api: AuditApi) => Promise<string | null>> = {
  /** Path prefix of an organization the audit user administers, the first in their menu: settings and the invite dialog need that role. */
  org: async (api) => {
    const [{ items: organizations }, { items: memberships }] = await Promise.all([
      api<{ items: { id: string; tenantId: string; slug: string }[] }>('/organizations?limit=50'),
      api<{ items: { channelId: string; channelType: string; role: string; archived: boolean; displayOrder: number }[] }>('/me/memberships'),
    ]);
    const [administered] = memberships
      .filter((membership) => membership.channelType === 'organization' && membership.role === 'admin' && !membership.archived)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    const organization = organizations.find(({ id }) => id === administered?.channelId) ?? organizations[0];
    return organization ? `/${organization.tenantId}/${organization.slug}` : null;
  },
};

/**
 * The sample of pages and states the audit covers (WCAG-EM steps 2 and 3): every page type, plus the overlays
 * that render outside it. This file belongs to the app: list your own routes and states here. A sync never overwrites it.
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
    overlay: true,
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
      await settle(page);
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
    overlay: true,
    path: '/home',
    auth: true,
    open: async (page) => {
      await page.keyboard.press('Shift+M');
      await settle(page);
    },
  },
  {
    id: 'search-sheet',
    overlay: true,
    path: '/home',
    auth: true,
    open: async (page) => {
      await page.keyboard.press('Shift+F');
      await settle(page);
    },
  },
  {
    id: 'account-sheet',
    overlay: true,
    path: '/home',
    auth: true,
    open: async (page) => {
      await page.keyboard.press('Shift+A');
      await settle(page);
    },
  },
  {
    id: 'invite-dialog',
    overlay: true,
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
    overlay: true,
    path: '{org}/organization/members',
    auth: true,
    open: async (page) => {
      await page.getByRole('gridcell').getByRole('button').first().click();
      await settle(page);
    },
  },
];
