/**
 * Picks specified keys from an object and returns a new object with those key-value pairs.
 */
export function pick<T, const K extends readonly (keyof T)[]>(obj: T, keys: K): { [P in K[number]]: T[P] } {
  const out = {} as { [P in K[number]]: T[P] };
  for (const k of keys) out[k] = obj[k];
  return out;
}
