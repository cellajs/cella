/**
 * Picks specified keys from an object and returns a new object with those key-value pairs.
 *
 * @param obj - The source object to pick keys from.
 * @param keys - An array of keys to pick from the source object.
 * @returns A new object containing only the specified key-value pairs.
 */
export function pickColumns<T, const K extends readonly (keyof T)[]>(obj: T, keys: K): { [P in K[number]]: T[P] } {
  const out = {} as { [P in K[number]]: T[P] };
  for (const k of keys) out[k] = obj[k];
  return out;
}
