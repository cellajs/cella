import type { DeepPartial } from './types';

function isObject(item: object) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/** Deep merges source objects into target, preserving nested structure. */
export function mergeDeep<T extends {}, U extends DeepPartial<T>>(target: T, ...sources: U[]) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && source && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key as keyof object])) {
        if (!target[key as keyof object]) Object.assign(target, { [key]: {} });
        mergeDeep(target[key as keyof object], source[key as keyof object]);
      } else {
        Object.assign(target, { [key]: source[key as keyof object] });
      }
    }
  }

  return mergeDeep(target, ...sources);
}

/**
 * Type guard for checking if an object has a key.
 * Enables type-safe property access without assertions.
 */
export function hasKey<T extends object>(obj: T, key: string): key is keyof T & string {
  return Object.hasOwn(obj, key);
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

/**
 * Type-safe Object.entries that preserves key literal types.
 * Use when iterating known objects where keys should remain narrowed.
 */
export function typedEntries<T extends Record<string, unknown>>(obj: T): [keyof T & string, T[keyof T]][] {
  return Object.entries(obj) as [keyof T & string, T[keyof T]][];
}

/**
 * Type-safe Object.keys that preserves key literal types.
 * Use when iterating known objects where keys should remain narrowed.
 */
export function typedKeys<T extends Record<string, unknown>>(obj: T): (keyof T & string)[] {
  return Object.keys(obj) as (keyof T & string)[];
}
