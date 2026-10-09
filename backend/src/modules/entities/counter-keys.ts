const plainCountPrefixes = ['e:c:', 'm:c:'];
const stampPrefixes = ['e:li:', 'e:lu:'];
const frontierPrefix = 'e:f:';
const sequenceKey = 'sequence';

const startsWithAny = (key: string, prefixes: string[]) => prefixes.some((prefix) => key.startsWith(prefix));
const likeAny = (column: string, prefixes: string[]) => prefixes.map((prefix) => `${column} LIKE '${prefix}%'`).join(' OR ');

/**
 * Whether a counter key is a plain count: the live rows of a type (`e:c:`, and `e:c:h:` for the rows homed at a
 * channel) or the memberships of a role (`m:c:`). Its deltas add up, a recount replaces its value, and it is the one
 * class on which the books must equal the tables.
 * @param key - A key of `channel_counters.counts`.
 * @returns True for a plain count.
 */
export const isPlainCountKey = (key: string): boolean => startsWithAny(key, plainCountPrefixes);

/**
 * Whether a counter key keeps the highest value it was given: a frontier (`e:f:`, `e:f:h:`) or an activity stamp
 * (`e:li:`, `e:lu:`). Two deltas for it merge as their maximum, never as their sum. The `apply_count_deltas` function
 * in Postgres holds the same rule for the stored value.
 * @param key - A key of `channel_counters.counts`.
 * @returns True for a key that merges as a maximum.
 */
export const isMaxMergeKey = (key: string): boolean => key.startsWith(frontierPrefix) || startsWithAny(key, stampPrefixes);

/**
 * Whether a recount may never lower a counter key: the sequence counter and every frontier. The worker may have
 * handed out values the tables do not show: to changes still in flight, or to rows deleted since.
 * @param key - A key of `channel_counters.counts`.
 * @returns True for a key that only moves forward.
 */
export const isForwardOnlyCounterKey = (key: string): boolean => key === sequenceKey || key.startsWith(frontierPrefix);

/**
 * The SQL form of `isPlainCountKey`.
 * @param column - The column or alias that holds the key.
 * @returns A parenthesized predicate.
 */
export const plainCountKeySql = (column: string): string => `(${likeAny(column, plainCountPrefixes)})`;

/**
 * The SQL form of `isForwardOnlyCounterKey`.
 * @param column - The column or alias that holds the key.
 * @returns A parenthesized predicate.
 */
export const forwardOnlyCounterKeySql = (column: string): string => `(${column} = '${sequenceKey}' OR ${likeAny(column, [frontierPrefix])})`;
