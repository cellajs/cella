import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { router } from '~/routes/router';
import { objectKeys } from '~/utils/object-keys';

type RoutesById = keyof typeof router.routesById;

type SearchParams = { from?: RoutesById; saveDataInSearch?: boolean };

/**
 * Keys owned by URL-driven overlays (user sheet, attachment dialog). Left out of the hook's state, so overlay writes
 * don't re-render the table behind them, and setSearch never writes back a stale overlay value.
 */
const overlaySearchKeys = new Set(['userSheetId', 'attachmentDialogId', 'groupId']);

/** Sorted keys and dropped undefined values, so equal search content always serializes to the same string. */
const serializeSearch = (search: Record<string, unknown>) => {
  const own: Record<string, unknown> = {};
  for (const key of Object.keys(search).sort()) {
    if (!overlaySearchKeys.has(key)) own[key] = search[key];
  }
  return JSON.stringify(own);
};

/** Query param state; with `saveDataInSearch` it reads and writes the URL. Routes own defaults and stripping. */
export function useSearchParams<T extends Record<string, string | string[] | undefined>>(searchParams?: SearchParams) {
  const { from, saveDataInSearch = true } = searchParams ?? {};

  const navigate = useNavigate();
  const params = useParams(from ? { from, strict: true } : { strict: false });

  // A string select re-renders only when the hook's own keys change, not on every URL write.
  const select = (search: Record<string, unknown>) => (saveDataInSearch ? serializeSearch(search) : '{}');
  const searchKey = useSearch(from ? { from, strict: true, select } : { strict: false, select });

  const getMergedSearch = () => JSON.parse(searchKey) as T;

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

  // The URL write from setSearch lands here too; only a change made elsewhere (back, link, defaults) needs new state.
  useEffect(() => {
    if (!saveDataInSearch || serializeSearch(currentSearch) === searchKey) return;
    setCurrentSearch(getMergedSearch());
  }, [searchKey]);

  return { search: currentSearch, setSearch };
}
