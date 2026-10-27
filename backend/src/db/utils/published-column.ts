import { isoTimestamp } from '#/db/utils/timestamp-columns';

/**
 * Null is a draft, a timestamp the moment of publication. A draft channel holds its invitations and shows to its own
 * members; a draft product is its author's alone and stays out of sync. A channel is live at insert unless its create
 * passes null; a product table opts in by spreading this and starts as a draft.
 */
export const publishedColumn = { publishedAt: isoTimestamp() };

/** The channel form: live at insert, so an app's create operation only has to say when it makes a draft. */
export const channelPublishedColumn = { publishedAt: isoTimestamp().defaultNow() };
