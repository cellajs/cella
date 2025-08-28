import type { InfiniteQueryData } from '../types';

type SortFunction<T> = (item: T) => string | number | null | undefined;

interface FilterOptions<T> {
  q: string;
  sort: keyof T;
  order: 'asc' | 'desc';
  searchIn: (keyof T)[];
  sortOptions: Partial<Record<keyof T, SortFunction<T>>>; // custom sort functions
  additionalFilter?: (item: T) => boolean;
}

/**
 * Filters and/or sorts array of items for UI display.
 * Works on fully loaded, infinite query, items
 */
export const filterVisibleData = <T>(cache: InfiniteQueryData<T>, options: FilterOptions<T>): { filteredItems: T[]; totalChange: number } => {
  const { q, sort, order, sortOptions, searchIn, additionalFilter } = options;

  const cachedItems = cache.pages.flatMap((p) => p.items);
  const normalizedSearch = q.trim().toLowerCase();

  // Filter items
  const filteredItems = cachedItems
    .filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        searchIn.some((key) => {
          const value = item[key];

          // Safely convert to string for search
          if (value == null) return false;
          return String(value).toLowerCase().includes(normalizedSearch);
        });

      const additionalMatch = additionalFilter ? additionalFilter(item) : true;

      return matchesSearch && additionalMatch;
    })
    // Sort items
    .sort((a, b) => {
      const aVal = sortOptions[sort] ? sortOptions[sort](a) : a[sort];
      const bVal = sortOptions[sort] ? sortOptions[sort](b) : b[sort];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') return order === 'asc' ? aVal - bVal : bVal - aVal;

      return order === 'asc'
        ? String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' })
        : String(bVal).localeCompare(String(aVal), undefined, { sensitivity: 'base' });
    });

  const totalChange = filteredItems.length - cachedItems.length;

  return { filteredItems, totalChange };
};
