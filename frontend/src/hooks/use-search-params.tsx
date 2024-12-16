import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import type router from '~/lib/router';
import { objectKeys } from '~/utils/object';

type RoutesById = keyof typeof router.routesById;

/**
 * Hook to manage and synchronize search parameters (query string) with the URL.
 *
 * @template T - The type of search parameters (query string).
 * @param from - The route identifier (optional). If provided, the hook is scoped to that route.
 * @param defaultValues - Default values for search parameters (optional).
 *
 * @returns An object with:
 *   - `search`: The current search parameters (query string).
 *   - `setSearch`: A function to update the search parameters and sync with the URL.
 */
const useSearchParams = <T extends Record<string, string | string[] | undefined>>({
  from,
  defaultValues,
}: { from?: RoutesById; defaultValues?: Partial<T> }) => {
  const navigate = useNavigate();

  const params = useParams(from ? { from, strict: true } : { strict: false });
  const search = useSearch(from ? { from, strict: true } : { strict: false });

  // Ref to store current search parameters (avoiding re-renders on changes)
  const valuesRef = useRef(search as T);

  /**
   * update the search parameters and synchronize with the URL.
   *
   * @param newValues - New search parameters to set.
   * @param saveSearch - Flag indicating whether to save the search to the URL.
   */
  const setSearch = (newValues: Partial<T>, saveSearch = true) => {
    // Merge new values with the current search parameters
    const searchParams: T = { ...valuesRef.current, ...newValues };

    // Process each search parameter
    for (const key of objectKeys(searchParams)) {
      const currentValue = searchParams[key];

      // Handle empty or undefined values by setting to default
      if (currentValue === '' || currentValue === undefined) {
        searchParams[key] = defaultValues?.[key] ?? (undefined as T[keyof T]);
      }

      // joining array values into a string
      if (Array.isArray(searchParams[key])) {
        searchParams[key] = (
          searchParams[key].length ? (searchParams[key].length === 1 ? searchParams[key][0] : searchParams[key].join('_')) : undefined
        ) as T[keyof T];
      }
    }

    // Check if any search parameters have changed
    const needToUpdate = Object.keys(searchParams).some((key) => searchParams[key] !== valuesRef.current[key]);

    // If parameters have changed and we need to save the new search state, navigate to the updated URL
    if (needToUpdate && saveSearch) {
      navigate({
        replace: true,
        params,
        resetScroll: false,
        to: '.',
        search: (prev) => ({
          ...prev,
          ...searchParams,
        }),
      });
    }

    valuesRef.current = searchParams;
  };

  useEffect(() => setSearch({ ...defaultValues, ...search } as Partial<T>), []);

  return { search: valuesRef.current, setSearch } as const;
};

export default useSearchParams;
