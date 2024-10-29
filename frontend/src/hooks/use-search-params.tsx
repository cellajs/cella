import { type FullSearchSchema, type RegisteredRouter, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { objectKeys } from '~/utils/object';

// Get the relevant keys from the FullSearchSchema
type SearchSchema = FullSearchSchema<RegisteredRouter['routeTree']>;
type SearchKeys = keyof SearchSchema;

// Define the SearchParams type as a subset of the FullSearchSchema
type SearchParams<T extends SearchKeys> = Pick<SearchSchema, T>;

const useSearchParams = <K extends SearchKeys>(defaultValues?: SearchParams<K>) => {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const search = useSearch({ strict: false });

  const valuesRef = useRef<SearchParams<K>>(search);
  const setSearch = (newValues: SearchParams<K>, saveSearch = true) => {
    const searchParams: SearchParams<K> = { ...valuesRef.current, ...newValues };

    for (const key of objectKeys(searchParams)) {
      const currentValue = searchParams[key];

      if (currentValue === '' || currentValue === undefined) {
        if (defaultValues?.[key] === '') searchParams[key] = undefined;
        else searchParams[key] = defaultValues?.[key];
      }

      if (Array.isArray(searchParams[key])) {
        searchParams[key] =
          searchParams[key].length > 0 ? (searchParams[key].length === 1 ? searchParams[key][0] : searchParams[key].join('_')) : undefined;
      }
    }

    // if searchParams are different from the current values
    const needToUpdate = Object.keys(searchParams).some(
      (key) => searchParams[key as keyof SearchParams<K>] !== valuesRef.current[key as keyof SearchParams<K>],
    );
    if (needToUpdate && saveSearch) {
      navigate({
        replace: true,
        params,
        to: '.',
        search: (prev) => ({
          ...prev,
          ...searchParams,
        }),
      });
    }

    valuesRef.current = searchParams;
  };
  useEffect(() => setSearch({ ...defaultValues, ...search }), []);

  return { search: valuesRef.current, setSearch } as const;
};

export default useSearchParams;
