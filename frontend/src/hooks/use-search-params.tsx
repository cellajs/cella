import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import type { router } from '~/routes/router';
import { objectKeys } from '~/utils/object-keys';

type RoutesById = keyof typeof router.routesById;

type SearchParams = {
  from?: RoutesById;
  saveDataInSearch?: boolean;
};

/**
 * Manages search params (query string), optionally syncing to the URL.
 * `saveDataInSearch` (default true) persists changes AND gates whether existing URL params are read on mount.
 *
 * Defaults are not this hook's job: a route declares them with zod `.default()` on `validateSearch`
 * (which rehydrates them on read) plus a `stripSearchParams` middleware (which keeps them out of the
 * URL). Each module's search-params-schemas file exports the defaults both sides share.
 */
export function useSearchParams<T extends Record<string, string | string[] | undefined>>(searchParams?: SearchParams) {
  const { from, saveDataInSearch = true } = searchParams ?? {};

  const navigate = useNavigate();
  const params = useParams(from ? { from, strict: true } : { strict: false });
  const search = useSearch(from ? { from, strict: true } : { strict: false });

  // Stable serialization of URL search, changes only when the URL changes.
  const searchKey = saveDataInSearch ? JSON.stringify(search) : '';
  const prevSearchKeyRef = useRef(searchKey);

  const getMergedSearch = () => (saveDataInSearch ? { ...search } : {}) as T;

  // State to hold the current search parameters
  const [currentSearch, setCurrentSearch] = useState<T>(getMergedSearch);

  const setSearch = (newValues: Partial<T>) => {
    const updatedSearch = { ...currentSearch, ...newValues };

    for (const key of objectKeys(updatedSearch)) {
      // Clear empty values; the route's zod defaults fill them back in on read
      if (updatedSearch[key] === '' || updatedSearch[key] === undefined) {
        updatedSearch[key] = undefined as T[keyof T];
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

  // Update current search state when URL search changes
  useEffect(() => {
    if (!saveDataInSearch || searchKey === prevSearchKeyRef.current) return;
    prevSearchKeyRef.current = searchKey;
    setCurrentSearch(getMergedSearch());
  }, [searchKey]);

  return { search: currentSearch, setSearch };
}
