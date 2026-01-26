import { DeepPartial } from "./types";

function isObject(item: object) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

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