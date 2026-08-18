/**
 * How far back an entity counts as unseen. One source for the server's `findUnseenCountsByUser`
 * predicate and client-side unseen tracking, which mirror each other row for row: a divergent
 * window miscounts badges with no error anywhere.
 */
export const seenWindowMs = 90 * 24 * 60 * 60 * 1000;
