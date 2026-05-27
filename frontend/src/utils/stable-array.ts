/** Returns `prev` when the arrays are element-identical, avoiding downstream memo busts. */
export function stableArray<T>(prev: T[], next: T[]): T[] {
  if (prev.length === next.length && prev.every((item, i) => item === next[i])) return prev;
  return next;
}
