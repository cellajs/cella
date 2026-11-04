import { useSearchParams } from '~/hooks/use-search-params';
import { useInfiniteRows } from '~/modules/common/data-table/use-infinite-rows';
import { SearchScope } from '~/modules/common/match-highlight/match-scope';
import { BaseEntityGrid, ChannelTile, EntityGridBar, gridSortDefaults, gridSortOptions } from '~/modules/entities/entity-grid';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { useUserStore } from '~/modules/user/user-store';

type OrgSearch = Parameters<typeof organizationsListQueryOptions>[0];
type OrgGridSearch = { q?: string; sort: NonNullable<OrgSearch['sort']>; order: NonNullable<OrgSearch['order']> };

const sortOptions = [gridSortOptions.name, gridSortOptions.createdAt] as const;

interface OrganizationsGridProps {
  fixedQuery?: Partial<OrgSearch>;
  focusView?: boolean;
  saveDataInSearch?: boolean;
}

export function OrganizationsGrid({ fixedQuery, saveDataInSearch, focusView }: OrganizationsGridProps) {
  const relatableUserId = fixedQuery?.relatableUserId;
  const ofAnotherUser = useUserStore((state) => !!relatableUserId && relatableUserId !== state.user?.id);

  const { search: baseSearch, setSearch } = useSearchParams<OrgGridSearch>({ saveDataInSearch, defaults: gridSortDefaults(sortOptions) });

  const search: OrgSearch = { ...baseSearch, ...fixedQuery };

  const queryOptions = organizationsListQueryOptions({ ...search, include: 'counts,members' });

  const isFiltered = !!search.q;

  const { rows: entities, isLoading, isFetching, error, hasNextPage, fetchMore } = useInfiniteRows(queryOptions);

  return (
    <div className="flex h-full flex-col gap-2">
      <EntityGridBar
        queryKey={queryOptions.queryKey}
        searchVars={baseSearch}
        label="c:organization"
        entityType="organization"
        roleFilter={false}
        alwaysShow
        setSearch={setSearch}
        sortOptions={sortOptions}
        focusView={focusView}
      />

      <SearchScope q={search.q}>
        <BaseEntityGrid
          label="c:organization"
          renderTile={(entity) => <ChannelTile entity={entity} hideOwnRole={ofAnotherUser} />}
          entities={entities}
          isLoading={isLoading}
          isFetching={isFetching}
          error={error}
          hasNextPage={hasNextPage}
          fetchMore={fetchMore}
          isFiltered={isFiltered}
          onResetFilters={() => setSearch({ q: '' })}
          queryKey={queryOptions.queryKey}
        />
      </SearchScope>
    </div>
  );
}
