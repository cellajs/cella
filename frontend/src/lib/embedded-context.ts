import { appConfig } from 'shared';

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
