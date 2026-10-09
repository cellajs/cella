// The screenshots this app ships, for `shot-driver.mjs`. This file belongs to the app: list your own pages and states
// here, and a sync never overwrites it (it is pinned in cella/cella.config.ts). The driver and SKILL.md stay upstream.

/**
 * The file type of every shot: 'webp' or 'png'. WebP is written lossless by the `cwebp` encoder (`brew install webp`),
 * at under a third of the PNG's weight. The slides in `marketing-config.tsx` and the README name the files by
 * extension, so a change here is a change there.
 */
export const format = 'webp';

/**
 * Viewport and scale per device. The ratios are the frames in `frontend/src/modules/marketing/device-mockup-frame.tsx`,
 * and the carousel renders a slide `object-contain`, so a shot that misses its ratio is letterboxed inside the mockup.
 * Scale 2 is a retina shot: a 1280px-wide app, drawn at 2560px. The mockup draws a slide far smaller than the app, so
 * the narrowest viewport that holds the page keeps its text readable.
 */
export const devices = {
  pc: { width: 1280, height: 720, scale: 2 }, // aspect-video
  // For a shot with the menu sheet open: it only stands beside the content from `2xl` up (`isDesktop` in app-nav.tsx),
  // which `appConfig.theme.screenSizes` puts at 1400px, and covers the table's first column below that.
  pcWide: { width: 1408, height: 792, scale: 2 }, // aspect-video
  tablet: { width: 768, height: 1024, scale: 2 }, // aspect-3/4
  mobile: { width: 375, height: 667, scale: 2 }, // aspect-9/16
};

/**
 * Values for the `{name}` placeholders in the paths below, read from the API as the shot user before the first visit.
 * `call` is a signed-in fetch of the app's own API, the same helper shape `a11y/scope-config.ts` resolvers get.
 */
export const placeholders = {
  /** Path prefix of an organization the shot user administers, the first in their menu: the one their menu opens on. */
  org: async (call) => {
    const [{ items: organizations }, { items: memberships }] = await Promise.all([call('/organizations?limit=50'), call('/me/memberships')]);
    const [administered] = memberships
      .filter((membership) => membership.channelType === 'organization' && membership.role === 'admin' && !membership.archived)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    const organization = organizations.find(({ id }) => id === administered?.channelId) ?? organizations[0];
    return organization ? `/${organization.tenantId}/${organization.slug}` : null;
  },
};

/** One-time UI that would otherwise land in a shot of a public page: the dev banner and the first-visit menu hint. */
export const suppress = {
  alerts: ['test-credentials'],
  hints: ['floating-menu-marketing', 'floating-menu-docs'],
};

/**
 * Opens the menu sheet, which the shots that show the organization list want standing open. The keyboard shortcut,
 * not the button: `#menu-nav` is the mobile bottom bar's, the sidebar's has no id, and a click leaves a hover state.
 */
const openMenu = async (page) => {
  await page.keyboard.press('Shift+M');
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

  // Archived entities fold away: the list a visitor reads is the active one, and the row keeps its count
  for (const toggle of await page.locator('#nav-sheet li[data-archived-visible="true"][data-has-archived="true"] > div > button').all()) await toggle.click();
  await page.locator('#nav-sheet li[data-archived-visible="true"][data-has-archived="true"]').first().waitFor({ state: 'detached' });
};

/**
 * Takes two things out of an organization's header that a visitor never meets: the entity id a development build
 * prints after the crumbs, and the "Upload cover" button an admin gets over an organization without a cover. Hidden,
 * never removed: React still owns both nodes. By text, never by role: the open menu sheet takes the page behind it
 * out of the accessibility tree, and a role locator then finds nothing.
 */
const tidyHeader = async (page) => {
  const hide = (elements) => {
    for (const element of elements) element.style.visibility = 'hidden';
  };
  await page.locator('#pt span', { hasText: /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/ }).evaluateAll(hide);
  await page.locator('button', { hasText: /^Upload cover$/ }).evaluateAll(hide);
};

/**
 * Every entry writes `<out>.<format>` and `<out>-dark.<format>`. `path` is a route, with `{name}` filled from the
 * placeholders above. `open` brings the page into the state the shot wants, after the route has rendered and settled.
 */
export const shots = [
  {
    id: 'system-page',
    device: 'pcWide',
    path: '/system/users',
    out: 'frontend/public/static/marketing/screenshots/system-page',
    open: openMenu,
  },
  {
    id: 'org-page',
    device: 'pc',
    path: '{org}/organization/members',
    out: 'frontend/public/static/marketing/screenshots/org-page',
    open: tidyHeader,
  },
  {
    id: 'settings',
    device: 'pc',
    path: '/account',
    out: 'frontend/public/static/marketing/screenshots/settings',
    // The page opens on General, a short form, and the sessions card below it gains an "Unnamed device" row with every
    // driver run: the sign-in methods fill the frame, the same on any database. `block: 'start'` puts the card's top
    // at the frame's top, less the scroll margin, which also ends the frame above the next card's empty state.
    open: async (page) =>
      page.locator('#spy-authentication-anchor-wrap').evaluate((element) => {
        element.style.scrollMarginTop = '3rem';
        element.scrollIntoView({ block: 'start' });
      }),
  },
  {
    id: 'readme',
    device: 'pcWide',
    path: '{org}/organization/members',
    out: 'frontend/public/static/marketing/screenshots/readme-screenshot',
    open: async (page) => {
      await openMenu(page);
      await tidyHeader(page);
    },
  },
];
