import { defineScreenshotsBase, type Page } from '@cellajs/cli/screenshots';
import { listMyMemberships, listOrganizations } from '../sdk/gen/index.ts';
import { apiClient, finishOnboarding } from './a11y.ts';

/**
 * Hidden entities fold away: the list a visitor reads is the active one, and the row keeps its count. A fold takes
 * its row out of the match, so the loop asks for the first one each time.
 */
const foldHidden = async (page: Page) => {
  const unfolded = page.locator('#nav-sheet [data-hidden-visible="true"][data-has-hidden="true"] > div button');
  while (await unfolded.count()) await unfolded.first().click();
};

/**
 * Opens the menu sheet, which the shots that show the organization list want standing open. The keyboard shortcut,
 * not the button: `#menu-nav` is the mobile bottom bar's, the sidebar's has no id, and a click leaves a hover state.
 */
export const openMenu = async (page: Page) => {
  await page.keyboard.press('Alt+M');
  await page.locator('#nav-sheet').waitFor();

  // "Keep open" puts the sheet beside the content; without it the sheet covers the page. The preference lives in the
  // per-user IndexedDB store, so it is set through its own switch, behind the sheet's preferences panel.
  // By role, not by `#keepNavOpen`: that id belongs to the hidden checkbox Base UI keeps at 1x1 off-screen, which
  // Playwright then refuses to click as outside the viewport.
  const preferences = page.getByRole('button', { name: 'Preferences', exact: true });
  await preferences.click();
  const keepOpen = page.getByRole('switch', { name: 'Keep menu open' });
  if ((await keepOpen.getAttribute('aria-checked')) !== 'true') await keepOpen.click();
  await preferences.click();
  await keepOpen.waitFor({ state: 'hidden' });
  await foldHidden(page);
};

/**
 * Hides what only a development stack shows: the debug button in the sidebar, and the health dot on the menu's Info row
 * when a testbed runs without every service. A stylesheet, so it also holds for the dot, which renders once the open
 * sheet's health check answers.
 */
export const hideDevUi = (page: Page) =>
  page.addStyleTag({ content: 'button[aria-label="toggle debug toolbar"], #nav-sheet .animate-status-pulse { visibility: hidden; }' });

/** Waits for a member's activity and MFA columns: a row renders first, and its last cell holds "-" until they arrive. */
export const membersFilled = (page: Page) =>
  page.waitForFunction(() =>
    /\d/.test([...(document.querySelector('.rdg-row')?.querySelectorAll('[role="gridcell"]') ?? [])].at(-1)?.textContent ?? ''),
  );

/**
 * Takes two things out of an organization's header that a visitor never meets: the entity id a development build
 * prints after the crumbs, and the "Upload cover" button an admin gets over an organization without a cover. Hidden,
 * never removed: React still owns both nodes. By text, never by role: the open menu sheet takes the page behind it
 * out of the accessibility tree, and a role locator then finds nothing.
 */
export const tidyHeader = async (page: Page) => {
  const hide = (elements: HTMLElement[]) => {
    for (const element of elements) element.style.visibility = 'hidden';
  };
  await page.locator('#pt span', { hasText: /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/ }).evaluateAll(hide);
  await page.locator('button', { hasText: /^Upload cover$/ }).evaluateAll(hide);
};

const marketing = 'frontend/public/static/marketing/screenshots';

/**
 * The template's marketing screenshots for `pnpm cella shoot`, synced with the UI they show. An app adds, removes
 * or overrides shots, devices and the format in `cella/screenshots.app.ts`.
 */
export default defineScreenshotsBase({
  // `marketing-config.tsx` and the README name the files by extension, so a change here is a change there
  format: 'webp',

  // The ratios are the frames in `frontend/src/modules/marketing/device-mockup-frame.tsx`, and the carousel renders a
  // slide `object-contain`, so a shot that misses its ratio is letterboxed inside the mockup. The mockup draws a slide
  // far smaller than the app, so the narrowest viewport that holds the page keeps its text readable.
  devices: {
    pc: { width: 1280, height: 720, scale: 2 }, // aspect-video
    // For a shot with the menu sheet open: it only stands beside the content from `2xl` up (`isDesktop` in app-nav.tsx),
    // which `appConfig.theme.screenSizes` puts at 1400px, and covers the table's first column below that.
    pcWide: { width: 1408, height: 792, scale: 2 }, // aspect-video
    tablet: { width: 768, height: 1024, scale: 2 }, // aspect-3/4
    mobile: { width: 375, height: 667, scale: 2 }, // aspect-9/16
    // The /about hero's floating screen: no mockup frame, so the ratio of a current phone
    phone: { width: 390, height: 844, scale: 2 }, // 9:19.5
    // The link preview: 1.91:1, which Open Graph readers show whole, and 1200px wide, which none draws wider
    card: { width: 1200, height: 630, scale: 1 },
  },

  // The dev banner and the first-visit menu hints of the public pages
  suppress: { alerts: ['test-credentials'], hints: ['floating-menu-marketing', 'floating-menu-docs'] },

  prepare: async (user) => {
    await finishOnboarding(apiClient(user));
  },

  placeholders: {
    /**
     * Path prefix of the first published organization in the shot user's menu that they administer. The seed makes the
     * first one a draft, whose page opens under a "Publish" banner.
     */
    org: async (user) => {
      const client = apiClient(user);
      const [{ results: organizations }, { results: memberships }] = await Promise.all([
        listOrganizations({ client, query: { maxPageSize: 50 } }),
        listMyMemberships({ client, query: { maxPageSize: 1000 } }),
      ]);
      const published = organizations.filter(({ publishedAt }) => publishedAt);
      const organization =
        memberships
          .filter((membership) => membership.channelType === 'organization' && membership.role === 'admin' && !membership.hidden)
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((membership) => published.find(({ id }) => id === membership.channelId))
          .find(Boolean) ?? published[0];
      return organization ? `/${organization.tenantId}/${organization.slug}` : null;
    },
  },

  shots: [
    {
      id: 'system-page',
      device: 'pcWide',
      path: '/system/organizations',
      out: `${marketing}/system-page`,
      open: async (page) => {
        await openMenu(page);
        await hideDevUi(page);
      },
    },
    {
      id: 'org-page',
      device: 'pc',
      path: '{org}/organization/members',
      out: `${marketing}/org-page`,
      open: async (page) => {
        await membersFilled(page);
        await tidyHeader(page);
        await hideDevUi(page);
      },
    },
    {
      id: 'settings',
      device: 'pc',
      path: '/account',
      out: `${marketing}/settings`,
      // The page opens on General, a short form, and the sessions card below it gains an "Unnamed device" row with every
      // run: the sign-in methods fill the frame, the same on any database. `block: 'start'` puts the card's top at the
      // frame's top, less the scroll margin. With MFA on the card holds a passkey and an authenticator app, and this
      // margin ends the frame below the next card's description, above its empty state.
      open: async (page) => {
        await page.locator('#spy-authentication-anchor-wrap').evaluate((element: HTMLElement) => {
          element.style.scrollMarginTop = '1.5rem';
          element.scrollIntoView({ block: 'start' });
        });
        await hideDevUi(page);
      },
    },
    {
      id: 'docs-operations',
      device: 'pc',
      path: '/docs/operations/table',
      out: `${marketing}/docs-operations`,
      // Module reads "auth" down the first screen and runs past the right edge at 1280px: off, the path column takes its
      // room. The pencil beside "Documentation" is the pages shortcut only a system admin gets.
      open: async (page) => {
        await page.locator('.rdg-row').first().waitFor();
        // Its name ends in "Some columns hidden": the table hides a few by default
        await page.getByRole('button', { name: /^View\b.*columns hidden$/ }).click();
        await page.getByRole('menuitemcheckbox', { name: 'Module' }).click();
        await page.keyboard.press('Escape');
        await page.getByRole('menu').waitFor({ state: 'hidden' });
        await page.locator('a[href="/docs/pages"]').evaluateAll((elements: HTMLElement[]) => {
          for (const element of elements) element.style.visibility = 'hidden';
        });
        await hideDevUi(page);
      },
    },
    {
      id: 'hero-menu',
      device: 'phone',
      path: '{org}/organization/members',
      out: `${marketing}/hero-menu`,
      // On a phone the menu covers the page; it opens holding the current organization, with no keep-open preference.
      // The table shows name and role only there, so `membersFilled` would wait for a column it never renders.
      open: async (page) => {
        await page.locator('.rdg-row').first().waitFor();
        await tidyHeader(page);
        await page.keyboard.press('Alt+M');
        await page.locator('#nav-sheet').waitFor();
        await foldHidden(page);
        await hideDevUi(page);
      },
    },
    {
      // The page under `hero-menu`, which the hero's menu sheet slides in over
      id: 'hero-page',
      device: 'phone',
      path: '{org}/organization/members',
      out: `${marketing}/hero-page`,
      open: async (page) => {
        await page.locator('.rdg-row').first().waitFor();
        await tidyHeader(page);
        await hideDevUi(page);
      },
    },
    {
      id: 'readme',
      device: 'pcWide',
      path: '{org}/organization/members',
      out: `${marketing}/readme-screenshot`,
      open: async (page) => {
        await membersFilled(page);
        await openMenu(page);
        await tidyHeader(page);
        await hideDevUi(page);
      },
    },
    {
      // The image `index.html` names for link previews. It shows the `readme` shot, and a full run writes that one first.
      id: 'thumbnail',
      device: 'card',
      path: '/thumbnail',
      out: 'frontend/public/thumbnail',
      mode: 'dark',
      format: 'jpg',
      open: async (page) => {
        await page.locator('main img').evaluate((image: HTMLImageElement) => image.decode());
        await hideDevUi(page);
      },
    },
  ],
});
