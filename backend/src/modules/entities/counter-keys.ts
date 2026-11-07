/** The live rows of a type in a channel's subtree: `e:c:{type}`. */
export const entityCountPrefix = 'e:c:';
/** The live rows of a type homed at the channel itself: `e:c:h:{type}`. */
export const entityCountHomePrefix = 'e:c:h:';
/** The newest sequence position of a type in an organization, on its row: `e:f:{type}`. */
export const frontierPrefix = 'e:f:';
/** The version of a versioned signal on its organization's row, `s:{signal type}`: it only counts up, and a recount leaves it alone. */
export const signalVersionPrefix = 's:';

const plainCountPrefixes = [entityCountPrefix, 'm:c:'];
/** Last insert and update timestamps of a type's rows homed at the channel: `e:li:h:{type}`, `e:lu:h:{type}`. */
const stampPrefixes = ['e:li:', 'e:lu:'];
const maxMergePrefixes = [...stampPrefixes, frontierPrefix];
/** The organization row's sequence reservation counter. */
const sequenceKey = 'sequence';

const startsWithAny = (key: string, prefixes: string[]) => prefixes.some((prefix) => key.startsWith(prefix));
const likeAny = (column: string, prefixes: string[]) => prefixes.map((prefix) => `${column} LIKE '${prefix}%'`).join(' OR ');

/**
 * Whether a counter key is a plain count: the live rows of a type (`e:c:`, and `e:c:h:` for the rows homed at a
 * channel) or the memberships of a role (`m:c:`). Its deltas add up, a recount replaces its value, and it is the one
 * class on which the books must equal the tables.
 */
export const isPlainCountKey = (key: string): boolean => startsWithAny(key, plainCountPrefixes);

/**
 * Whether a counter key keeps the highest value it was given: a frontier (`e:f:`) or an activity stamp
 * (`e:li:`, `e:lu:`). Two deltas for it merge as their maximum, never as their sum.
 */
export const isMaxMergeKey = (key: string): boolean => startsWithAny(key, maxMergePrefixes);

/**
 * Whether a recount may never lower a counter key: the sequence counter and every frontier. The worker may have
 * handed out values the tables do not show: to changes still in flight, or to rows deleted since.
 */
export const isForwardOnlyCounterKey = (key: string): boolean => key === sequenceKey || key.startsWith(frontierPrefix);

/**
 * The SQL form of `isPlainCountKey`.
 * @param column - The column or alias that holds the key.
 * @returns A parenthesized predicate.
 */
export const plainCountKeySql = (column: string): string => `(${likeAny(column, plainCountPrefixes)})`;

/**
 * The SQL form of `isMaxMergeKey`, which `apply_count_deltas` merges by.
 * @param column - The column or alias that holds the key.
 * @returns A parenthesized predicate.
 */
export const maxMergeKeySql = (column: string): string => `(${likeAny(column, maxMergePrefixes)})`;

/**
 * The SQL form of `isForwardOnlyCounterKey`.
 * @param column - The column or alias that holds the key.
 * @returns A parenthesized predicate.
 */
export const forwardOnlyCounterKeySql = (column: string): string => `(${column} = '${sequenceKey}' OR ${likeAny(column, [frontierPrefix])})`;
