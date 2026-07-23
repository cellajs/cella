/**
 * View an object as a string-keyed bag so entity-agnostic code can read columns whose names
 * come from the hierarchy at runtime.
 *
 * TypeScript does not widen a declared object type to an index signature on its own, so this is
 * the single audited place that performs it. Reads return `unknown` and must be narrowed by the
 * caller, which keeps the widening from leaking into the value types.
 */
export const asRecord = (value: object): Record<string, unknown> => value as Record<string, unknown>;
