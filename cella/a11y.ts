import { auditContrast, defineA11yBase, type Page, type SignedIn, settle } from '@cellajs/cli/a11y';
import { type Client, createClient, createConfig } from '../sdk/gen/client/index.ts';
import { getMe, listMyMemberships, listOrganizations, updateMe } from '../sdk/gen/index.ts';

/** The SDK as the signed-in user: its functions check each response against the spec, and a failed one names its request. */
export const apiClient = ({ backendUrl, cookie }: SignedIn) => {
  const client = createClient(createConfig({ baseUrl: backendUrl, headers: { cookie }, throwOnError: true }));
  client.interceptors.error.use((error, response, _request, options) =>
    response && !response.ok ? new Error(`${options.method} ${options.url} answered ${response.status}`) : error,
  );
  return client;
};

/** A freshly seeded user has not finished onboarding, and `/home` then redirects to the welcome page. */
export const finishOnboarding = async (client: Client) => {
  const { user } = await getMe({ client });
  if (!user.userFlags.finishedOnboarding) await updateMe({ client, body: { userFlags: { finishedOnboarding: true } } });
  return user;
};

export const openMenuSheet = async (page: Page) => {
  await page.keyboard.press('Alt+M');
  await settle(page);
};

export const openSearchSheet = async (page: Page) => {
  await page.keyboard.press('ControlOrMeta+K');
  await settle(page);
};

export const openAccountSheet = async (page: Page) => {
  await page.keyboard.press('Alt+A');
  await settle(page);
};

/**
 * The template's pages and states for `pnpm cella a11y`, synced with the UI they describe: every page type plus the
 * overlays that render outside it (WCAG-EM steps 2 and 3). An app adds, removes or overrides states in `cella/a11y.app.ts`.
 */
export default defineA11yBase({
  prepare: async (user) => {
    const client = apiClient(user);
    const { contrast } = await finishOnboarding(client);
    // The browser context asks for more contrast, but `/me` overwrites the seeded UI store on every authenticated page.
    // Without this the run would quietly measure the default edges on exactly the pages richest in form controls.
    if (contrast !== auditContrast) await updateMe({ client, body: { contrast: auditContrast } });
  },

  placeholders: {
    /** Path prefix of an organization the audit user administers, the first in their menu: settings and the invite dialog need that role. */
    org: async (user) => {
      const client = apiClient(user);
      const [{ items: organizations }, { items: memberships }] = await Promise.all([
        listOrganizations({ client, query: { limit: 50 } }),
        listMyMemberships({ client }),
      ]);
      const [administered] = memberships
        .filter((membership) => membership.channelType === 'organization' && membership.role === 'admin' && !membership.archived)
        .sort((a, b) => a.displayOrder - b.displayOrder);
      const organization = organizations.find(({ id }) => id === administered?.channelId) ?? organizations[0];
      return organization ? `/${organization.tenantId}/${organization.slug}` : null;
    },
  },

  sources: ['frontend/src/**/*.ts', 'frontend/src/**/*.tsx', 'frontend/src/**/*.css', ':!**/*.test.*', ':!**/*.stories.*', ':!**/tests/**'],

  scope: [
    // Public website
    { id: 'marketing-home', path: '/about', auth: false },
    { id: 'features', path: '/features', auth: false },
    { id: 'sync-engine', path: '/sync-engine', auth: false },
    { id: 'contact', path: '/contact', auth: false, forms: ['required', 'personal'] },
    { id: 'legal-privacy', path: '/legal/privacy', auth: false },
    { id: 'legal-accessibility', path: '/legal/accessibility', auth: false },

    // Docs
    { id: 'docs-overview', path: '/docs/overview', auth: false },
    { id: 'docs-operations', path: '/docs/operations', auth: false },
    { id: 'docs-schemas', path: '/docs/schemas', auth: false },
    { id: 'docs-page', path: '/docs/page/quickstart', auth: false },
    // The floating nav's buttons are Tab stops at this width only
    { id: 'docs-page-phone', path: '/docs/page/architecture', auth: false, context: { viewport: { width: 390, height: 800 } } },
    { id: 'docs-search', overlay: true, path: '/docs/overview', auth: false, open: openSearchSheet },

    // Authentication
    { id: 'sign-in', path: '/auth/authenticate', auth: false, forms: ['required', 'personal', 'sign-in'] },
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
    { id: 'account', path: '/account', auth: true, forms: ['personal'] },
    { id: 'org-attachments', path: '{org}/organization/attachments', auth: true },
    { id: 'org-members', path: '{org}/organization/members', auth: true },
    { id: 'org-settings', path: '{org}/organization/settings', auth: true },
    { id: 'system-users', path: '/system/users', auth: true },
    { id: 'system-organizations', path: '/system/organizations', auth: true },

    // No overlay: the page beside a pinned sheet stays in use, so axe must find it exposed. Pinning takes the width of `2xl`
    {
      id: 'menu-sheet-pinned',
      path: '/home',
      auth: true,
      context: { viewport: { width: 1500, height: 900 } },
      open: async (page) => {
        await openMenuSheet(page);
        const preferences = page.getByRole('button', { name: 'Preferences' });
        await preferences.click();
        await page.getByRole('switch', { name: /keep menu open/i }).click();
        // An open panel dims the menu behind it
        await preferences.click();
        await settle(page);
      },
    },

    // Overlays
    { id: 'menu-sheet', overlay: true, path: '/home', auth: true, open: openMenuSheet },
    { id: 'search-sheet', overlay: true, path: '/home', auth: true, open: openSearchSheet },
    { id: 'account-sheet', overlay: true, path: '/home', auth: true, open: openAccountSheet },
    {
      id: 'invite-dialog',
      overlay: true,
      path: '{org}/organization/members',
      auth: true,
      forms: ['required'],
      open: async (page) => {
        await page.getByRole('button', { name: 'Invite' }).click();
        await settle(page);
        await page.getByRole('button', { name: /invite with email/i }).click();
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
  ],
});
