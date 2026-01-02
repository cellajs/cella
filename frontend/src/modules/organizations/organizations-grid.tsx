import { useInfiniteQuery } from '@tanstack/react-query';
import useSearchParams from '~/hooks/use-search-params';
import { BaseEntityGrid, EntityGridBar, EntityGridTile } from '~/modules/entities/entity-grid';
import { organizationsQueryOptions } from './query';

type OrgSearch = Parameters<typeof organizationsQueryOptions>[0];

interface Props {
  fixedQuery?: Partial<OrgSearch>;
  focusView?: boolean;
  saveDataInSearch?: boolean;
}

// Optionally set a custom tile
const tileComponent = EntityGridTile;

/**
 * Display a grid of organization tiles.
 */
export function OrganizationsGrid({ fixedQuery, saveDataInSearch, focusView }: Props) {
  const { search: baseSearch, setSearch } = useSearchParams({ saveDataInSearch });

  const search: OrgSearch = { ...baseSearch, ...(fixedQuery ?? {}) };

  const queryOptions = organizationsQueryOptions(search);

  const q = search.q ?? '';
  const isFiltered = !!q;

  const { data, isFetching, isLoading, error, hasNextPage, fetchNextPage } = useInfiniteQuery({
    ...queryOptions,
    select: (data) => data.pages.flatMap((p) => p.items),
  });

  const entities = data;

  return (
    <div className="flex flex-col gap-4 h-full">
      <EntityGridBar
        queryKey={queryOptions.queryKey}
        searchVars={baseSearch}
        label={'common:organization'}
        setSearch={setSearch}
        focusView={focusView}
      />

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
      />
    </div>
  );
}
