import type { QueryKey } from '@tanstack/react-query';
import { BirdIcon, SearchIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMountedState } from '~/hooks/use-mounted-state';
import type { TKey } from '~/lib/i18n-locales';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { InfiniteLoader } from '~/modules/common/data-table/infinite-loader';
import { Button } from '~/modules/ui/button';
import { Skeleton } from '~/modules/ui/skeleton';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

/** limitedView shows at most this many tiles, and {@link EntityGridBar} hides itself at or below it when unfiltered. */
export const gridPreviewLimit = 3;

const entityGridClass = tw('grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-6 lg:grid-cols-[repeat(auto-fill,minmax(330px,1fr))]');

interface BaseEntityGridProps<TEntity extends { id: string }> {
  label: TKey;
  entities?: TEntity[];
  /** Renders one tile; a grid passes its own props through the closure, and tiles keep their identity when those change. */
  renderTile: (entity: TEntity) => ReactNode;
  /** Approximate height of each tile in px while loading (default: 180, a banner ChannelTile). */
  skeletonHeight?: number;
  isLoading: boolean;
  isFetching: boolean;
  /** The list query's error: it holds back the empty state, and the loader reports the failed page and stops paging. */
  error: unknown;
  hasNextPage?: boolean;
  fetchMore: () => Promise<unknown>;
  /** A search or filter is active: an empty list shows "No … found" (else "No … yet"). */
  isFiltered: boolean;
  /** Shows at most {@link gridPreviewLimit} tiles and a "Show all" button. */
  limitedView?: boolean;
  onExpand?: () => void;
  /** List query key; with limitedView, sources the server total for the "Show all (N)" button. */
  queryKey?: QueryKey;
}

// Total subscriptions need a key unconditionally; this one never matches a cached list.
const noTotalKey: QueryKey = ['entity-grid', 'no-total'];

function EntityGridSkeleton({ tileHeight = 180 }: { tileHeight?: number }) {
  const { hasStarted } = useMountedState();

  return (
    <div data-started={hasStarted} className={cn(entityGridClass, 'mb-12 transition-opacity duration-300 data-[started=false]:opacity-0')}>
      {Array.from({ length: 6 }).map((_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static keys are fine here as this is a skeleton
        <Skeleton key={index} className="w-full rounded-lg" style={{ height: `${tileHeight}px` }} />
      ))}
    </div>
  );
}

export function BaseEntityGrid<TEntity extends { id: string }>({
  label,
  entities,
  renderTile,
  skeletonHeight,
  isLoading,
  isFetching,
  error,
  hasNextPage,
  fetchMore,
  isFiltered,
  limitedView,
  onExpand,
  queryKey,
}: BaseEntityGridProps<TEntity>) {
  const { t } = useTranslation();
  const total = useListQueryTotal(queryKey ?? noTotalKey);

  if (isLoading || !entities) return <EntityGridSkeleton tileHeight={skeletonHeight} />;

  if (!isFetching && !error && entities.length === 0) {
    const resource = t(label, { count: 0 }).toLowerCase();
    return isFiltered ? (
      <ContentPlaceholder icon={SearchIcon} title="c:no_resource_found" titleOptions={{ resource }} />
    ) : (
      <ContentPlaceholder icon={BirdIcon} title="c:no_resource_yet" titleOptions={{ resource }} />
    );
  }

  const isLimited = limitedView && entities.length > gridPreviewLimit;
  const visibleEntities = isLimited ? entities.slice(0, gridPreviewLimit) : entities;
  const showAllCount = total !== null && total > gridPreviewLimit ? ` (${total})` : '';

  return (
    <div className="mb-12">
      <div className={entityGridClass}>
        {visibleEntities.map((entity) => (
          <Fragment key={entity.id}>{renderTile(entity)}</Fragment>
        ))}
      </div>

      {isLimited ? (
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" onClick={onExpand}>
            {`${t('c:show_all')}${showAllCount}`}
          </Button>
        </div>
      ) : (
        <InfiniteLoader hasNextPage={!!hasNextPage} isFetching={isFetching} isFetchMoreError={!!error} fetchMore={fetchMore} />
      )}
    </div>
  );
}
