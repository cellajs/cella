/**
 * Returns the keys of an object as an array of its keys' types.
 *
 * @param obj - The object whose keys are to be returned.
 * @returns An array of the object's keys.
 */
export const objectKeys = <T extends object>(obj: T) => {
  return Object.keys(obj) as Array<keyof T>;
};

/**
 * Returns the entries of an object as an array of key-value pairs with their respective types.
 *
 * @param obj - The object whose entries are to be returned.
 * @returns An array of the object's key-value pairs.
 */
export function objectEntries<T extends Record<string, unknown>>(obj: T) {
  return Object.entries(obj) as {
    [K in keyof T]: [K, T[K]];
  }[keyof T][];
}

/**
 * Creates a typed record from an array of keys with computed values.
 * Isolates the unavoidable type assertion for Object.fromEntries.
 */
export function recordFromKeys<K extends string, V>(keys: readonly K[], valueFn: (key: K) => V): Record<K, V> {
  return Object.fromEntries(keys.map((k) => [k, valueFn(k)])) as Record<K, V>;
}

/**
 * Creates a record where each key maps to itself.
 * Useful for creating type-safe enum-like objects from string tuples.
 */
export function identityRecord<const T extends readonly string[]>(keys: T): { readonly [K in T[number]]: K } {
  return Object.fromEntries(keys.map((k) => [k, k])) as { readonly [K in T[number]]: K };
}
