import { isRecord } from '../utils/as-record.ts';
import type { DeepPartial } from './types.ts';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function mergeDeep<T extends {}, U extends DeepPartial<T>>(target: T, ...sources: U[]) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isRecord(target) && source && isRecord(source)) {
    for (const key in source) {
      if (!Object.hasOwn(source, key) || FORBIDDEN_KEYS.has(key)) continue;
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

export function recordFromKeys<K extends string, V>(keys: readonly K[], valueFn: (key: K) => V): Record<K, V> {
  return Object.fromEntries(keys.map((k) => [k, valueFn(k)])) as Record<K, V>;
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
