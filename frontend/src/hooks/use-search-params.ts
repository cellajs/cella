import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { appConfig } from 'shared';
import { getProductDeepLink } from '~/lib/entity-modules';
import type { router } from '~/routes/router';
import { objectKeys } from '~/utils/object-keys';

type RoutesById = keyof typeof router.routesById;

interface UseSearchParamsOptions<T> {
  from?: RoutesById;
  /** Reads and writes the state in the URL; default true. Without it the state stays local. */
  saveDataInSearch?: boolean;
  /** What an absent key reads as, so a list shows the sort its query sends in local state too; a route's schema fills its own. */
  defaults?: Partial<T>;
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

/** Query param state of a table or list. Routes own stripping. */
export function useSearchParams<T extends Record<string, string | string[] | undefined>>({
  from,
  saveDataInSearch = true,
  defaults = {},
}: UseSearchParamsOptions<T> = {}) {
  const navigate = useNavigate();
  const params = useParams(from ? { from, strict: true } : { strict: false });

  // A string select re-renders only when the hook's own keys change, not on every URL write.
  const select = (search: Record<string, unknown>) => (saveDataInSearch ? serializeSearch(search) : '{}');
  const searchKey = useSearch(from ? { from, strict: true, select } : { strict: false, select });

  const readSearch = () => JSON.parse(searchKey) as T;

  const [currentSearch, setCurrentSearch] = useState<T>(readSearch);

  const setSearch = (newValues: Partial<T>) => {
    // Only the keys asked for: a second write in the same tick holds a stale `currentSearch`, and would undo the first
    const written: Partial<T> = {};
    for (const key of objectKeys(newValues)) {
      const value = newValues[key];
      // An empty value is absent in the URL; the route's zod defaults fill it back in on read
      const isEmpty = value === '' || (Array.isArray(value) && value.length === 0);
      written[key] = isEmpty ? undefined : value;
    }

    // A list compares by content: the router writes it comma-separated
    if (!objectKeys(written).some((key) => JSON.stringify(written[key]) !== JSON.stringify(currentSearch[key]))) return;

    setCurrentSearch((current) => ({ ...current, ...written }));
    if (saveDataInSearch) {
      navigate({
        replace: true,
        params,
        resetScroll: false,
        to: '.',
        search: (prev) => ({ ...prev, ...written }),
      });
    }
  };

  // The URL write from setSearch reaches this effect too; only a change made elsewhere (back, link, defaults) needs new state.
  useEffect(() => {
    if (!saveDataInSearch || serializeSearch(currentSearch) === searchKey) return;
    setCurrentSearch(readSearch());
  }, [searchKey]);

  const search = { ...currentSearch };
  for (const key of objectKeys(defaults)) {
    const fallback = defaults[key];
    if (search[key] === undefined && fallback !== undefined) search[key] = fallback;
  }

  return { search, setSearch };
}
