import { useSuspenseQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { Bird, Search } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import type { GetContextEntitiesData } from '~/api.gen';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { InfiniteLoader } from '~/modules/common/data-table/infinine-loader';
import type { EntityGridWrapperProps } from '~/modules/entities/entity-grid';
import { EntityTile } from '~/modules/entities/entity-grid/tile';
import { contextEntitiesQueryOptions } from '~/modules/entities/query';

export type EntitySearch = Pick<NonNullable<GetContextEntitiesData['query']>, 'sort' | 'q' | 'role'>;

interface Props extends EntityGridWrapperProps {
  searchVars: EntitySearch;
  totalCount: number | null;
  setTotalCount: (newTotal: number | null) => void;
}

export const BaseEntityGrid = ({
  tileComponent: TileComponent = EntityTile,
  entityType,
  label,
  userId,
  searchVars,
  setTotalCount,
  totalCount,
}: Props) => {
  // TODO change to infinite query
  const { data, isFetching, error } = useSuspenseQuery(contextEntitiesQueryOptions({ ...searchVars, types: [entityType], targetUserId: userId }));

  const isFiltered = !!searchVars.q;

  const entities = useMemo(() => data.items[entityType], [data.items]);

  // // isFetching already includes next page fetch scenario
  // const fetchMore = useCallback(async () => {
  //   if (!hasNextPage || isLoading || isFetching) return;
  //   await fetchNextPage();
  // }, [hasNextPage, isLoading, isFetching]);

  useEffect(() => setTotalCount(data.total), [data.total]);

  if (!isFetching && !error && !isFiltered && !totalCount)
    return <ContentPlaceholder icon={Bird} title={t('common:no_resource_yet', { resource: t(label, { count: 0 }).toLowerCase() })} />;

  if (!isFetching && !error && !totalCount)
    return <ContentPlaceholder icon={Search} title={t('common:no_resource_found', { resource: t(label, { count: 0 }).toLowerCase() })} />;

  return (
    <div className="mb-12">
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(330px,1fr))]">
        {entities.map((entity) => (
          <TileComponent key={entity.id} entity={entity} />
        ))}
      </div>

      {/* Remove on infiniteQuery swap */}
      {/* <InfiniteLoader hasNextPage={hasNextPage} isFetching={isFetching} isFetchMoreError={!!error} fetchMore={fetchMore} /> */}
      <InfiniteLoader hasNextPage={false} isFetching={isFetching} isFetchMoreError={!!error} />
    </div>
  );
};
