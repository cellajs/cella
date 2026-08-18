import type { DeepPartial } from './types.ts';

function isObject(item: object) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function mergeDeep<T extends {}, U extends DeepPartial<T>>(target: T, ...sources: U[]) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && source && isObject(source)) {
    for (const key in source) {
      if (!Object.hasOwn(source, key) || FORBIDDEN_KEYS.has(key)) continue;
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

export function hasKey<T extends object>(obj: T, key: string): key is keyof T & string {
  return Object.hasOwn(obj, key);
}

export function recordFromKeys<K extends string, V>(keys: readonly K[], valueFn: (key: K) => V): Record<K, V> {
  return Object.fromEntries(keys.map((k) => [k, valueFn(k)])) as Record<K, V>;
}

export function identityRecord<const T extends readonly string[]>(keys: T): { readonly [K in T[number]]: K } {
  return Object.fromEntries(keys.map((k) => [k, k])) as { readonly [K in T[number]]: K };
}

/** Object.entries with key literal types preserved. */
export function typedEntries<T extends Record<string, unknown>>(obj: T): [keyof T & string, T[keyof T]][] {
  return Object.entries(obj) as [keyof T & string, T[keyof T]][];
}

export function typedKeys<T extends Record<string, unknown>>(obj: T): (keyof T & string)[] {
  return Object.keys(obj) as (keyof T & string)[];
}

/** Narrows to the non-empty tuple drizzle and zod demand for enum columns. Throws when empty. */
export function nonEmpty<T>(values: readonly T[]): readonly [T, ...T[]] {
  if (values.length === 0) throw new Error('nonEmpty: expected at least one element');
  return values as readonly [T, ...T[]];
}
