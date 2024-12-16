import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type router from '~/lib/router';
import { objectKeys } from '~/utils/object';

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
 * @param saveDataInSearch - A flag (default: `true`) that controls whether changes to search parameters should be saved in the URL.
 *
 * @returns An object with:
 *   - `search`: The current search parameters (query string).
 *   - `setSearch`: A function to update the search parameters and sync with the URL.
 */
const useSearchParams = <T extends Record<string, string | string[] | undefined>>({
  from,
  defaultValues,
  saveDataInSearch = true,
}: SearchParams<T>) => {
  const navigate = useNavigate();

  const params = useParams(from ? { from, strict: true } : { strict: false });
  const search = useSearch(from ? { from, strict: true } : { strict: false });

  // State to hold the current search parameters
  const [currentSearch, setCurrentSearch] = useState({} as T);

  const setSearch = (newValues: Partial<T>) => {
    const updatedSearch = { ...currentSearch, ...newValues };

    // Process each search parameter
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
    const needToUpdate = Object.keys(updatedSearch).some((key) => updatedSearch[key] !== currentSearch[key]);

    // If parameters have changed and we need to save the new search state, navigate to the updated URL
    if (needToUpdate && saveDataInSearch) {
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

    setCurrentSearch(updatedSearch);
  };

  // On mount: Merge default values with search and update the URL if necessary
  useEffect(() => {
    if (!defaultValues) return;
    const mergedSearch = { ...defaultValues, ...search } as T;

    // Check if there are any missing default values
    const missingDefaults = objectKeys(defaultValues).some((key) => {
      // type guard to ensure key is a valid
      if (key in search) return search[key as keyof typeof search] === undefined || search[key as keyof typeof search] === '';
      return true;
    });

    if (missingDefaults) setSearch(mergedSearch); // Update the URL with default values

    setCurrentSearch(mergedSearch); // Initialize state
  }, []); // Run only on mount

  useEffect(() => {
    if (!saveDataInSearch) return;
    setCurrentSearch(search as T);
  }, [search]);

  return { search: currentSearch, setSearch };
};

export default useSearchParams;
