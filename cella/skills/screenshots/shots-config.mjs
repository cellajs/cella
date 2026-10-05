// The screenshots this app ships, for `shot-driver.mjs`. This file belongs to the app: list your own pages and states
// here, and a sync never overwrites it (it is pinned in cella/cella.config.ts). The driver and SKILL.md stay upstream.

/**
 * Viewport and scale per device. The ratios are the frames in `frontend/src/modules/marketing/device-mockup-frame.tsx`,
 * and the carousel renders a slide `object-contain`, so a shot that misses its ratio is letterboxed inside the mockup.
 * Scale 2 is a retina shot: a 1280px-wide app, drawn at 2560px.
 */
export const devices = {
  // 1600 wide because the menu sheet only pushes the content beside it from 2xl up (`isDesktop` in app-nav.tsx), and
  // overlaps the table below that. 1.5x is still more pixels than the mockup's ~735 CSS px ever draws.
  pc: { width: 1600, height: 900, scale: 1.5 }, // aspect-video
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
};

/**
 * Every entry writes `<out>.png` and `<out>-dark.png`. `path` is a route, with `{name}` filled from the placeholders
 * above. `open` brings the page into the state the shot wants, after the route has rendered and settled.
 */
export const shots = [
  {
    id: 'system-page',
    device: 'pc',
    path: '/system/users',
    out: 'frontend/public/static/marketing/screenshots/system-page',
    open: openMenu,
  },
  {
    id: 'org-page',
    device: 'pc',
    path: '{org}/organization/members',
    out: 'frontend/public/static/marketing/screenshots/org-page',
  },
  {
    id: 'settings',
    device: 'pc',
    path: '/account',
    out: 'frontend/public/static/marketing/screenshots/settings',
    // The page opens on General, which is a short form; sessions and authentication fill the frame. `block: 'start'`
    // puts the card's own top at the frame's top, where `scrollIntoViewIfNeeded` leaves the form above it half cut.
    open: async (page) => page.locator('#spy-sessions-anchor-wrap').evaluate((element) => element.scrollIntoView({ block: 'start' })),
  },
  {
    id: 'readme',
    device: 'pc',
    path: '{org}/organization/members',
    out: 'frontend/public/static/marketing/screenshots/readme-screenshot',
    open: openMenu,
  },
];
