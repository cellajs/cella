import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import type { router } from '~/routes/router';
import { objectKeys } from '~/utils/object-keys';

type RoutesById = keyof typeof router.routesById;

type SearchParams<T> = {
  from?: RoutesById;
  defaultValues?: Partial<T>;
  saveDataInSearch?: boolean;
};

/**
 * Hook to manage and synchronize search parameters (query string) with the URL.
 *
 * @template T - The type of search parameters (query string).
 * @param from - The route identifier (optional). If provided, the hook is scoped to that route.
 * @param defaultValues - Default values for search parameters (optional).
 * @param saveDataInSearch - Whether changes should be persisted to URL (default: `true`). Also controls whether existing URL params are read on mount.
 * @returns An object with:
 *   - `search`: The current search parameters (query string).
 *   - `setSearch`: A function to update the search parameters and sync with the URL.
 */
export function useSearchParams<T extends Record<string, string | string[] | undefined>>(
  searchParams?: SearchParams<T>,
) {
  const { from, defaultValues, saveDataInSearch = true } = searchParams ?? {};

  const navigate = useNavigate();
  const params = useParams(from ? { from, strict: true } : { strict: false });
  const search = useSearch(from ? { from, strict: true } : { strict: false });

  // Stable serialization of URL search — only changes when URL actually changes
  const searchKey = saveDataInSearch ? JSON.stringify(search) : '';
  const prevSearchKeyRef = useRef(searchKey);

  const getMergedSearch = () => ({ ...defaultValues, ...(saveDataInSearch ? search : {}) }) as T;

  // State to hold the current search parameters
  const [currentSearch, setCurrentSearch] = useState<T>(getMergedSearch);

  const setSearch = (newValues: Partial<T>) => {
    const updatedSearch = { ...currentSearch, ...newValues };

    for (const key of objectKeys(updatedSearch)) {
      // Reset empty values to defaults
      if (updatedSearch[key] === '' || updatedSearch[key] === undefined) {
        updatedSearch[key] = defaultValues?.[key] ?? (undefined as T[keyof T]);
        continue;
      }

      // Flatten array values into underscore-joined string
      if (!Array.isArray(updatedSearch[key])) continue;
      const arr = updatedSearch[key];
      updatedSearch[key] = (arr.length <= 1 ? arr[0] : arr.join('_')) as T[keyof T];
    }

    // Skip if nothing changed
    if (!Object.keys(updatedSearch).some((key) => updatedSearch[key] !== currentSearch[key])) return;

    setCurrentSearch(updatedSearch);
    if (saveDataInSearch) {
      navigate({
        replace: true,
        params,
        resetScroll: false,
        to: '.',
        search: (prev) => ({ ...prev, ...updatedSearch }),
      });
    }
  };

  // Sync default values on mount if necessary
  useEffect(() => {
    if (!defaultValues) return;

    // Only navigate if some defaults are missing from the URL
    const needsSync = Object.keys(defaultValues).some((key) => !(key in search));
    if (!needsSync) return;

    navigate({
      replace: true,
      params,
      resetScroll: false,
      to: '.',
      search: (prev) => ({ ...prev, ...defaultValues }),
    });
  }, []);

  // Update current search state when URL search changes
  useEffect(() => {
    if (!saveDataInSearch || searchKey === prevSearchKeyRef.current) return;
    prevSearchKeyRef.current = searchKey;
    setCurrentSearch(getMergedSearch());
  }, [searchKey]);

  return { search: currentSearch, setSearch };
}
