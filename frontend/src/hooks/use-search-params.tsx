import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import type router from '~/lib/router';
import { objectKeys } from '~/utils/object';

type RoutesById = keyof typeof router.routesById;

type SearchParams<T> = {
  from?: RoutesById;
  defaultValues?: Partial<T>;
  saveDataInSearch?: boolean;
  useCurrentSearch?: boolean;
};

/**
 * Hook to manage and synchronize search parameters (query string) with the URL.
 *
 * @template T - The type of search parameters (query string).
 * @param from - The route identifier (optional). If provided, the hook is scoped to that route.
 * @param defaultValues - Default values for search parameters (optional).
 * @param saveDataInSearch - A flag (default: `true`) that controls whether changes to search parameters should be saved in the URL.
 * @param useCurrentSearch - A flag (default: saveDataInSearch) that controls whether use search parameters that already exist in url.
 * @returns An object with:
 *   - `search`: The current search parameters (query string).
 *   - `setSearch`: A function to update the search parameters and sync with the URL.
 */
const useSearchParams = <T extends Record<string, string | string[] | number | undefined>>({
  from,
  defaultValues,
  saveDataInSearch = true,
  useCurrentSearch = saveDataInSearch,
}: SearchParams<T>) => {
  const navigate = useNavigate();
  const params = useParams(from ? { from, strict: true } : { strict: false });
  const search = useSearch(from ? { from, strict: true } : { strict: false });

  // Memoize merged search params with default values
  const mergedSearch = useMemo(
    () =>
      ({
        ...defaultValues,
        ...(useCurrentSearch ? search : {}),
      }) as T,
    [defaultValues, search, useCurrentSearch],
  );

  // State to hold the current search parameters
  const [currentSearch, setCurrentSearch] = useState<T>(mergedSearch);

  const setSearch = (newValues: Partial<T>) => {
    const updatedSearch = { ...currentSearch, ...newValues };

    for (const key of objectKeys(updatedSearch)) {
      const currentValue = updatedSearch[key];

      // Handle empty or undefined values by setting to default
      if (currentValue === '' || currentValue === undefined) {
        updatedSearch[key] = defaultValues?.[key] ?? (undefined as T[keyof T]);
      }

      // Join array values into a string
      if (Array.isArray(updatedSearch[key])) {
        updatedSearch[key] = (
          updatedSearch[key].length ? (updatedSearch[key].length === 1 ? updatedSearch[key][0] : updatedSearch[key].join('_')) : undefined
        ) as T[keyof T];
      }
    }

    // Check if any search parameters have changed
    const hasChanges = Object.keys(updatedSearch).some((key) => updatedSearch[key] !== currentSearch[key]);

    if (hasChanges) {
      setCurrentSearch(updatedSearch);
      if (saveDataInSearch) {
        navigate({
          replace: true,
          params,
          resetScroll: false,
          to: '.',
          search: (prev) => ({
            ...prev,
            ...updatedSearch,
          }),
        });
      }
    }
  };

  // Sync default values on mount if necessary
  useEffect(() => {
    if (!defaultValues) return;
    navigate({
      replace: true,
      params,
      resetScroll: false,
      to: '.',
      search: (prev) => ({
        ...prev,
        ...defaultValues,
      }),
    });
  }, []);

  // Update current search state when URL search changes
  useEffect(() => {
    if (!saveDataInSearch || JSON.stringify(currentSearch) === JSON.stringify(mergedSearch)) return;
    setCurrentSearch(mergedSearch);
  }, [mergedSearch]);

  return { search: currentSearch, setSearch };
};

export default useSearchParams;
