import { appConfig } from 'shared';
import { embeddedHandoffKey } from 'shared/utils/embedded-session';

/**
 * Whether this document runs the app's embedded pages, which an LTI platform shows in its frame. Decided once, from the
 * address the document loaded, before any store or database opens: the document is embedded for its whole life.
 */
export const isEmbedded = typeof location !== 'undefined' && location.pathname.startsWith('/embed/');

/**
 * The prefix of every name a document shares with the app's other documents on its origin: storage keys, database
 * names, locks and broadcast channels. An embedded document holds another session, often of another person, in the
 * same browser: when the app launches itself, the frame and the tab around it share one origin. Its own prefix keeps
 * its user, cache, leader tab and messages apart.
 */
export const sharedNamePrefix = isEmbedded ? `embedded-${appConfig.slug}` : appConfig.slug;

/**
 * Takes the handoff code out of the address at load: no history entry or reload holds it. The navigation timing entry
 * keeps the first address, which telemetry redacts (`scrubUrl`).
 */
const takeHandoffCode = () => {
  const code = new URLSearchParams(location.hash.slice(1)).get(embeddedHandoffKey);
  if (code) history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  return code;
};

let handoffCode = isEmbedded ? takeHandoffCode() : null;

/**
 * The embedded session's token, in this document's memory alone: another frame of the app on the platform's page
 * shares its storage and cookies, never its memory. A reload loses it, and the page asks for a new launch.
 */
let sessionToken: string | null = null;

/** The token every request of an embedded document sends, empty while it holds none. */
export const embeddedSessionToken = () => sessionToken ?? '';

/** The handoff code a launch handed this document, once: a later call finds none. */
export const takeEmbeddedHandoffCode = () => {
  const code = handoffCode;
  handoffCode = null;
  return code;
};

/** Keeps the token a redeemed handoff answered. */
export const keepEmbeddedSessionToken = (token: string) => {
  sessionToken = token;
};
