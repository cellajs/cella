/**
 * A string-keyed view, so entity-agnostic code can read columns named by the hierarchy at
 * runtime. TypeScript never widens a declared object type to an index signature on its own, and
 * this is the one audited place that does. Reads return `unknown` for the caller to narrow.
 */
export const asRecord = (value: object): Record<string, unknown> => value as Record<string, unknown>;

/** Whether a value is a plain object whose keys can be read: client input, a stored document, a config fragment. */
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
