/**
 * Whether the page-enter mask should be skipped for the current navigation.
 *
 * Set by the router on each navigation (see router.ts). It is `true` only when navigating between
 * two pages of the same leaf route (e.g. org → org, or any context entity → same entity type) via a
 * forward navigation (PUSH/REPLACE) — the one case where there is no scroll delta to mask, so the
 * page-enter curtain is unnecessary.
 *
 * Kept in a leaf module (no router/routeTree imports) so consumers can read it without creating a
 * circular import back through the route tree.
 */
let skipPageEnter = false;

export const setSkipPageEnter = (value: boolean) => {
  skipPageEnter = value;
};

export const getSkipPageEnter = () => skipPageEnter;
