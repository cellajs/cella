import { t } from 'i18next';
import { BirdIcon, SearchIcon } from 'lucide-react';
import type { ComponentType } from 'react';

import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { InfiniteLoader } from '~/modules/common/data-table/infinite-loader';
import { EntityGridSkeleton } from '~/modules/entities/entity-grid';

type BaseEntityGridProps<TEntity extends { id: string }> = {
  label: string;

  // render
  entities?: TEntity[];
  tileComponent: ComponentType<{ entity: TEntity }>;

  // skeleton
  /** Approximate height of each tile in px, passed to skeleton (default: 180) */
  skeletonHeight?: number;

  // state
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;

  // pagination
  hasNextPage?: boolean;
  fetchNextPage: () => Promise<unknown>;

  // empty-state logic
  isFiltered: boolean;
};

/**
 * Displays a paginated grid of entity tiles with loading and empty states.
 */
export function BaseEntityGrid<TEntity extends { id: string }>({
  label,
  entities,
  tileComponent: TileComponent,
  skeletonHeight,
  isLoading,
  isFetching,
  error,
  hasNextPage,
  fetchNextPage,
  isFiltered,
}: BaseEntityGridProps<TEntity>) {
  const fetchMore = async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  };

  if (isLoading || !entities) return <EntityGridSkeleton tileHeight={skeletonHeight} />;

  if (!isFetching && !error && entities.length === 0) {
    return isFiltered ? (
      <ContentPlaceholder
        icon={SearchIcon}
        title="common:no_resource_found"
        titleProps={{ resource: t(label, { count: 0 }).toLowerCase() }}
      />
    ) : (
      <ContentPlaceholder
        icon={BirdIcon}
        title="common:no_resource_yet"
        titleProps={{ resource: t(label, { count: 0 }).toLowerCase() }}
      />
    );
  }

  return (
    <div className="mb-12">
      <div className="grid gap-3 md:gap-6 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(330px,1fr))]">
        {entities.map((entity) => (
          <TileComponent key={entity.id} entity={entity} />
        ))}
      </div>

      <InfiniteLoader
        hasNextPage={!!hasNextPage}
        isFetching={isFetching}
        isFetchMoreError={!!error}
        fetchMore={fetchMore}
      />
    </div>
  );
}
