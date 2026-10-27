import { isRecord } from '../utils/as-record.ts';
import type { DeepPartial } from './types.ts';

const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Merges `sources` into `target`, left to right, and returns `target`, which it mutates. A record merges key by key; any
 * other value, an array included, replaces the target's. `__proto__`, `constructor` and `prototype` keys are skipped.
 */
export function mergeDeep<T extends {}, U extends DeepPartial<T>>(target: T, ...sources: U[]) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isRecord(target) && source && isRecord(source)) {
    for (const key in source) {
      if (!Object.hasOwn(source, key) || forbiddenKeys.has(key)) continue;
      if (isRecord(source[key as keyof object])) {
        if (!target[key as keyof object]) Object.assign(target, { [key]: {} });
        mergeDeep(target[key as keyof object], source[key as keyof object]);
      } else {
        Object.assign(target, { [key]: source[key as keyof object] });
      }
    }
  }

  return mergeDeep(target, ...sources);
}

/** A record with an entry per key, its value computed by `valueFn`. */
export function recordFromKeys<K extends string, V>(keys: readonly K[], valueFn: (key: K) => V): Record<K, V> {
  return Object.fromEntries(keys.map((key) => [key, valueFn(key)])) as Record<K, V>;
}

/** Object.entries with key literal types preserved. */
export function typedEntries<T extends Record<string, unknown>>(obj: T): [keyof T & string, T[keyof T]][] {
  return Object.entries(obj) as [keyof T & string, T[keyof T]][];
}

/** Narrows to the non-empty tuple drizzle and zod demand for enum columns. Throws when empty. */
export function nonEmpty<T>(values: readonly T[]): readonly [T, ...T[]] {
  if (values.length === 0) throw new Error('nonEmpty: expected at least one element');
  return values as readonly [T, ...T[]];
}
