/** A copy of `obj` with only `keys`, typed to them. */
export function pick<T, const K extends readonly (keyof T)[]>(obj: T, keys: K): { [P in K[number]]: T[P] } {
  const out = {} as { [P in K[number]]: T[P] };
  for (const key of keys) out[key] = obj[key];
  return out;
}
