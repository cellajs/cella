/** A JSON Merge Patch (RFC 7396) of `T`: every member optional, `null` removes it, an object member a patch of its own. */
export type MergePatch<T> = {
  [K in keyof T]?:
    | (NonNullable<T[K]> extends readonly unknown[] ? T[K] : NonNullable<T[K]> extends object ? MergePatch<NonNullable<T[K]>> : T[K])
    | null;
};

const isJsonObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Keys an assignment would read as the object's prototype: a patch never writes them. */
const prototypeKeys = new Set(['__proto__', 'constructor', 'prototype']);

const mergeObject = (target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> => {
  const result = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (prototypeKeys.has(key)) continue;
    if (value === null) delete result[key];
    else if (isJsonObject(value)) result[key] = mergeObject(isJsonObject(result[key]) ? result[key] : {}, value);
    else if (value !== undefined) result[key] = value;
  }
  return result;
};

/**
 * Applies a JSON Merge Patch (RFC 7396) to a stored object: an object member merges into the stored one key by key,
 * `null` removes a key, and an array or a scalar replaces the stored value. A key the patch leaves out keeps its value.
 * @returns A new object, without the keys a `null` removed: their reader fills the default.
 */
export const applyMergePatch = <T extends object>(target: T, patch: MergePatch<T>): T =>
  // Built key by key, so the merged object is stated as the stored type it was read as.
  mergeObject(Object.fromEntries(Object.entries(target)), Object.fromEntries(Object.entries(patch))) as T;
