/**
 * How far back an entity counts as "unseen" (creation window). Single source for the server's
 * unseen-count predicate (`findUnseenCountsByUser`) and client-side unseen tracking, which
 * mirror each other row-for-row: a divergent window would silently miscount badges.
 */
export const seenWindowMs = 90 * 24 * 60 * 60 * 1000;
