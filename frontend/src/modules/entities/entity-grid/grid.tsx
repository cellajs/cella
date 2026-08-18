import type { QueryKey } from '@tanstack/react-query';
import { t } from 'i18next';
import { BirdIcon, SearchIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { TKey } from '~/lib/i18n-locales';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { InfiniteLoader } from '~/modules/common/data-table/infinite-loader';
import { EntityGridSkeleton } from '~/modules/entities/entity-grid';
import { Button } from '~/modules/ui/button';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

/** limitedView shows at most this many tiles, and {@link EntityGridBar} hides itself at or below it when unfiltered. */
export const GRID_PREVIEW_LIMIT = 3;

type BaseEntityGridProps<TEntity extends { id: string }> = {
  label: TKey;

  // render
  entities?: TEntity[];
  tileComponent: ComponentType<{ entity: TEntity }>;

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

  /** When true, only show up to {@link GRID_PREVIEW_LIMIT} items with a "Show all" button */
  limitedView?: boolean;
  onExpand?: () => void;
  /** List query key; with limitedView, sources the server total for the "Show all (N)" button. */
  queryKey?: QueryKey;
};

// Total subscriptions need a key unconditionally; this one never matches a cached list.
const noTotalKey: QueryKey = ['entity-grid', 'no-total'];

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
  limitedView,
  onExpand,
  queryKey,
}: BaseEntityGridProps<TEntity>) {
  const total = useListQueryTotal(queryKey ?? noTotalKey);

  const fetchMore = async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  };

  if (isLoading || !entities) return <EntityGridSkeleton tileHeight={skeletonHeight} />;

  if (!isFetching && !error && entities.length === 0) {
    return isFiltered ? (
      <ContentPlaceholder
        icon={SearchIcon}
        title="c:no_resource_found"
        titleProps={{ resource: t(label, { count: 0 }).toLowerCase() }}
      />
    ) : (
      <ContentPlaceholder
        icon={BirdIcon}
        title="c:no_resource_yet"
        titleProps={{ resource: t(label, { count: 0 }).toLowerCase() }}
      />
    );
  }

  const isLimited = limitedView && entities.length > GRID_PREVIEW_LIMIT;
  const visibleEntities = isLimited ? entities.slice(0, GRID_PREVIEW_LIMIT) : entities;
  const showAllCount = total !== null && total > GRID_PREVIEW_LIMIT ? ` (${total})` : '';

  return (
    <div className="mb-12">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-1 md:grid-cols-2 md:gap-6 lg:grid-cols-[repeat(auto-fill,minmax(330px,1fr))]">
        {visibleEntities.map((entity) => (
          <TileComponent key={entity.id} entity={entity} />
        ))}
      </div>

      {isLimited ? (
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" onClick={onExpand}>
            {`${t('c:show_all')}${showAllCount}`}
          </Button>
        </div>
      ) : (
        <InfiniteLoader
          hasNextPage={!!hasNextPage}
          isFetching={isFetching}
          isFetchMoreError={!!error}
          fetchMore={fetchMore}
        />
      )}
    </div>
  );
}
