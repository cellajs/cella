import { type FullSearchSchema, type RegisteredRouter, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import type router from '~/lib/router';
import { objectKeys } from '~/utils/object';

// Get the relevant keys from the FullSearchSchema
type SearchSchema = FullSearchSchema<RegisteredRouter['routeTree']>;
export type SearchKeys = keyof SearchSchema;

// Define the SearchParams type as a subset of the FullSearchSchema
export type SearchParams<T extends SearchKeys> = Pick<SearchSchema, T>;

type RoutesById = keyof typeof router.routesById;

const useSearchParams = <K extends SearchKeys>(from?: RoutesById, defaultValues?: SearchParams<K>) => {
  const navigate = useNavigate();

  // Get params and search
  const params = useParams(from ? { from, strict: true } : { strict: false });
  const search = useSearch(from ? { from, strict: true } : { strict: false });

  const valuesRef = useRef<SearchParams<K>>(search as SearchParams<K>);

  const setSearch = (newValues: SearchParams<K>, saveSearch = true) => {
    const searchParams: SearchParams<K> = { ...valuesRef.current, ...newValues };

    // Process search parameters using for...of loop
    for (const key of objectKeys(searchParams)) {
      const currentValue = searchParams[key];

      // Handle empty or undefined values
      if (currentValue === '' || currentValue === undefined) {
        searchParams[key] = defaultValues?.[key] ?? undefined;
      }

      // Handle array values
      if (Array.isArray(searchParams[key])) {
        searchParams[key] = searchParams[key].length
          ? searchParams[key].length === 1
            ? searchParams[key][0]
            : searchParams[key].join('_')
          : undefined;
      }
    }

    // Check if the search parameters have changed
    const needToUpdate = Object.keys(searchParams).some(
      (key) => searchParams[key as keyof SearchParams<K>] !== valuesRef.current[key as keyof SearchParams<K>],
    );

    // Navigate if there are changes
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

  // Set initial search values when the hook mounts
  useEffect(() => setSearch({ ...defaultValues, ...search } as SearchParams<K>), []);

  return { search: valuesRef.current, setSearch } as const;
};

export default useSearchParams;
