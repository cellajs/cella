import { useInfiniteQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { BirdIcon, SearchIcon } from 'lucide-react';
import { useCallback } from 'react';
import type { GetContextEntitiesData } from '~/api.gen';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { InfiniteLoader } from '~/modules/common/data-table/infinine-loader';
import type { EntityGridWrapperProps } from '~/modules/entities/entity-grid';
import { GridSkeleton } from '~/modules/entities/entity-grid/skeleton';
import { EntityTile } from '~/modules/entities/entity-grid/tile';
import type { contextEntitiesQueryOptions } from '~/modules/entities/query';

export type EntitySearch = Pick<NonNullable<GetContextEntitiesData['query']>, 'sort' | 'q' | 'role'>;

interface Props extends EntityGridWrapperProps {
  searchVars: EntitySearch;
  queryOptions: ReturnType<typeof contextEntitiesQueryOptions>;
}

export const BaseEntityGrid = ({ queryOptions, tileComponent: TileComponent = EntityTile, entityType, label, searchVars }: Props) => {
  const {
    data: entities,
    isFetching,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    ...queryOptions,
    select: (data) => data.pages.flatMap(({ items }) => items.filter((e) => e.entityType === entityType)),
  });

  const isFiltered = !!searchVars.q;

  // isFetching already includes next page fetch scenario
  const fetchMore = useCallback(async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  }, [hasNextPage, isLoading, isFetching]);

  // Render skeleton only on initial load
  if (isLoading || !entities) return <GridSkeleton />;

  if (!isFetching && !error && !entities.length) {
    return isFiltered ? (
      <ContentPlaceholder icon={SearchIcon} title={t('common:no_resource_found', { resource: t(label, { count: 0 }).toLowerCase() })} />
    ) : (
      <ContentPlaceholder icon={BirdIcon} title={t('common:no_resource_yet', { resource: t(label, { count: 0 }).toLowerCase() })} />
    );
  }

  return (
    <div className="mb-12">
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(330px,1fr))]">
        {entities.map((entity) => (
          <TileComponent key={entity.id} entity={entity} />
        ))}
      </div>

      <InfiniteLoader hasNextPage={hasNextPage} isFetching={isFetching} isFetchMoreError={!!error} fetchMore={fetchMore} />
    </div>
  );
};
