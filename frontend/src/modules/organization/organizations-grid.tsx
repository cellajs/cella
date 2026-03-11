import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from '~/hooks/use-search-params';
import { BaseEntityGrid, EntityGridBar, EntityGridTile } from '~/modules/entities/entity-grid';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { organizationsListQueryOptions } from './query';

type OrgSearch = Parameters<typeof organizationsListQueryOptions>[0];

interface Props {
  fixedQuery?: Partial<OrgSearch>;
  focusView?: boolean;
  saveDataInSearch?: boolean;
  /** When true, show only 3 items with a "Show all" button */
  limitedView?: boolean;
}

// Optionally set a custom tile
const tileComponent = EntityGridTile;

/**
 * Display a grid of organization tiles.
 */
export function OrganizationsGrid({ fixedQuery, saveDataInSearch, focusView, limitedView: initialLimitedView }: Props) {
  const [expanded, setExpanded] = useState(false);
  const limitedView = initialLimitedView && !expanded;

  const { search: baseSearch, setSearch } = useSearchParams({ saveDataInSearch });

  const search: OrgSearch = { ...baseSearch, ...(fixedQuery ?? {}) };

  const queryOptions = organizationsListQueryOptions(search);

  const q = search.q ?? '';
  const isFiltered = !!q;

  const { data, isFetching, isLoading, error, hasNextPage, fetchNextPage } = useInfiniteQuery({
    ...queryOptions,
    select: (data) => data.pages.flatMap((p) => p.items) as EnrichedOrganization[],
  });

  // When no explicit sort is chosen, use membership displayOrder (user's personal arrangement)
  const entities =
    !search.sort && data
      ? [...data].sort((a, b) => (a.membership?.displayOrder ?? 0) - (b.membership?.displayOrder ?? 0))
      : data;

  return (
    <div className="flex flex-col pt-4 gap-2 h-full">
      {!limitedView && (
        <EntityGridBar
          queryKey={queryOptions.queryKey}
          searchVars={baseSearch}
          label={'common:organization'}
          setSearch={setSearch}
          isSheet={!focusView}
          focusView={focusView}
        />
      )}

      <BaseEntityGrid
        label="common:organization"
        tileComponent={tileComponent}
        entities={entities}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
        isFiltered={isFiltered}
        limitedView={limitedView}
        onExpand={() => setExpanded(true)}
      />
    </div>
  );
}
