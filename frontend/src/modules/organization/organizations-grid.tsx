import { useState } from 'react';
import { useSearchParams } from '~/hooks/use-search-params';
import { useInfiniteRows } from '~/modules/common/data-table/use-infinite-rows';
import { BaseEntityGrid, ChannelTile, EntityGridBar } from '~/modules/entities/entity-grid';
import { useUserStore } from '~/modules/user/user-store';
import { organizationsListQueryOptions } from './query';

type OrgSearch = Parameters<typeof organizationsListQueryOptions>[0];

interface Props {
  fixedQuery?: Partial<OrgSearch>;
  focusView?: boolean;
  saveDataInSearch?: boolean;
  /** When true, show only 3 items with a "Show all" button */
  limitedView?: boolean;
}

export function OrganizationsGrid({ fixedQuery, saveDataInSearch, focusView, limitedView: initialLimitedView }: Props) {
  const [expanded, setExpanded] = useState(false);
  const limitedView = initialLimitedView && !expanded;

  const { search: baseSearch, setSearch } = useSearchParams({ saveDataInSearch });

  const search: OrgSearch = { ...baseSearch, ...(fixedQuery ?? {}) };

  const ofAnotherUser = useUserStore((state) => !!search.relatableUserId && search.relatableUserId !== state.user?.id);

  const queryOptions = organizationsListQueryOptions({ ...search, include: 'counts,members' });

  const q = search.q ?? '';
  const isFiltered = !!q;

  const { rows: entities, isLoading, isFetching, error, hasNextPage, fetchMore } = useInfiniteRows(queryOptions);

  return (
    <div className="flex h-full flex-col gap-2">
      {!limitedView && (
        <EntityGridBar
          queryKey={queryOptions.queryKey}
          searchVars={baseSearch}
          label={'c:organization'}
          entityType="organization"
          // Discovery grid: a role filter collapses the scope to membership-only; bar stays for short lists
          roleFilter={false}
          alwaysShow
          setSearch={setSearch}
          focusView={focusView}
        />
      )}

      <BaseEntityGrid
        label="c:organization"
        renderTile={(entity) => <ChannelTile entity={entity} hideOwnRole={ofAnotherUser} />}
        entities={entities}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchMore}
        isFiltered={isFiltered}
        limitedView={limitedView}
        onExpand={() => setExpanded(true)}
        queryKey={queryOptions.queryKey}
      />
    </div>
  );
}
