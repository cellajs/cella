import { isoTimestamp } from '#/db/utils/timestamp-columns';

/**
 * Null is a draft, a timestamp the moment of publication, stamped by the server and never a default. A draft channel
 * holds its invitations and shows to its own members; a draft product is its author's alone and stays out of sync.
 * Every channel has it; a product table opts in by spreading it. See ARCHITECTURE.md, Row stamps.
 */
export const publishedColumn = { publishedAt: isoTimestamp() };
