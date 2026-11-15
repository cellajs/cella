/** Characters of a channel code: a digit, then six of `[a-z0-9]`. */
export const channelCodeLength = 7;

/** The path a link key takes after a channel code: one lowercase letter naming the product type, then its number, e.g. `t42`. */
export const productLinkKeyPattern = '[a-z][1-9][0-9]*';

/** A share link's path: `/{code}` names a channel, `/{code}/t42` the product numbered 42 in it. */
// The edge sends it on to `/api/links` + path (infra/caddy/Caddyfile, the Vite dev proxy), where the preview answers,
// and the service worker leaves it to the network. No app page has this shape: a code starts with a digit, while an
// organization slug and every top-level page start with a letter, and app pages are `/{tenantId}/{organizationSlug}/…`.
export const shareLinkPath = `^/[0-9][a-z0-9]{${channelCodeLength - 1}}(?:/${productLinkKeyPattern})?(?:\\?|$)`;
