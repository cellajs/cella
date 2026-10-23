import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { appConfig } from 'shared';
import { getProductDeepLink } from '~/lib/entity-modules';
import type { router } from '~/routes/router';
import { objectKeys } from '~/utils/object-keys';

type RoutesById = keyof typeof router.routesById;

interface UseSearchParamsOptions {
  from?: RoutesById;
  /** Reads and writes the state in the URL; default true. Without it the state stays local. */
  saveDataInSearch?: boolean;
}

/**
 * Keys owned by URL-driven overlays: the user sheet, each product's registered `deepLinkParam` (its sheet or dialog)
 * and the attachment dialog's `groupId`. Left out of the hook's state, so overlay writes don't re-render the table
 * behind them, and setSearch never writes back a stale overlay value.
 */
const isOverlaySearchKey = (key: string) =>
  key === 'userSheetId' || key === 'groupId' || appConfig.productEntityTypes.some((entityType) => getProductDeepLink(entityType).param === key);

/** Sorted keys and dropped undefined values, so equal search content always serializes to the same string. */
const serializeSearch = (search: Record<string, unknown>) => {
  const withoutOverlays: Record<string, unknown> = {};
  for (const key of Object.keys(search).sort()) {
    if (!isOverlaySearchKey(key)) withoutOverlays[key] = search[key];
  }
  return JSON.stringify(withoutOverlays);
};

/** Query param state of a table or list. Routes own defaults and stripping. */
export function useSearchParams<T extends Record<string, string | string[] | undefined>>({
  from,
  saveDataInSearch = true,
}: UseSearchParamsOptions = {}) {
  const navigate = useNavigate();
  const params = useParams(from ? { from, strict: true } : { strict: false });

  // A string select re-renders only when the hook's own keys change, not on every URL write.
  const select = (search: Record<string, unknown>) => (saveDataInSearch ? serializeSearch(search) : '{}');
  const searchKey = useSearch(from ? { from, strict: true, select } : { strict: false, select });

  const readSearch = () => JSON.parse(searchKey) as T;

  const [currentSearch, setCurrentSearch] = useState<T>(readSearch);

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
      const values = updatedSearch[key];
      updatedSearch[key] = (values.length <= 1 ? values[0] : values.join('_')) as T[keyof T];
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

  // The URL write from setSearch reaches this effect too; only a change made elsewhere (back, link, defaults) needs new state.
  useEffect(() => {
    if (!saveDataInSearch || serializeSearch(currentSearch) === searchKey) return;
    setCurrentSearch(readSearch());
  }, [searchKey]);

  return { search: currentSearch, setSearch };
}
