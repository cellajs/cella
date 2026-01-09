import type { CompareFunction } from '~/modules/docs/json-viewer';

/**
 * Sort function for JsonEditor that places primitive values before collections (objects/arrays).
 * Within each group, items are sorted alphabetically by key.
 */
export const valuesFirstSort: CompareFunction = (a, b) => {
  const aIsCollection = typeof a[1] === 'object' && a[1] !== null;
  const bIsCollection = typeof b[1] === 'object' && b[1] !== null;

  // Values (non-collections) come first
  if (aIsCollection && !bIsCollection) return 1;
  if (!aIsCollection && bIsCollection) return -1;

  // Within each group, sort alphabetically by key
  if (a[0] < b[0]) return -1;
  if (a[0] > b[0]) return 1;
  return 0;
};
