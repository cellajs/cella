import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { Bird, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import type z from 'zod';
import type { zGetEntitiesWithAdminsData } from '~/api.gen/zod.gen';
import { useOnlineManager } from '~/hooks/use-online-manager';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { GridSkeleton } from '~/modules/entities/entity-grid/skeleton';
import { EntityTile } from '~/modules/entities/entity-grid/tile';
import type { EntityGridWrapperProps } from '~/modules/entities/entity-grid/wrapper';
import { contextEntitiesQueryOptions } from '~/modules/entities/query';

// TODO (BLOCKING): Can we also include roles and userId in the searchVars?
// @hey-api/openapi-ts incorrectly creates schema, imo due to z.preprocess combined with .optional(), `null | undefined` instead `undefined`
export type EntitySearch = Pick<z.infer<typeof zGetEntitiesWithAdminsData>['query'], 'sort' | 'q'>;

interface Props extends EntityGridWrapperProps {
  searchVars: EntitySearch;
  setTotalCount: (newTotal?: number) => void;
  totalCount?: number;
  fetchMore?: () => void;
}

export const BaseEntityGrid = ({
  tileComponent: TileComponent = EntityTile,
  entityType,
  label,
  roles,
  userId,
  searchVars,
  setTotalCount,
  totalCount,
  fetchMore,
}: Props) => {
  const { isOnline } = useOnlineManager();

  const [initialDone, setInitialDone] = useState(false);

  const { ref: measureRef, inView } = useInView({ triggerOnce: false, threshold: 0 });

  const {
    data: entities = [],
    isLoading,
    isFetching,
    error,
  } = useQuery(contextEntitiesQueryOptions({ ...searchVars, roles, type: entityType, targetUserId: userId }));

  const isFiltered = !!searchVars.q;

  useEffect(() => {
    if (isFetching) return;
    setTotalCount(entities.length);
  }, [entities.length, isFetching]);

  // Fetch more entities using infinite loading
  useEffect(() => {
    if (!entities.length || error || !fetchMore || isFetching || !inView) return;

    if (typeof totalCount === 'number' && entities.length >= totalCount) return;

    // Throttle fetchMore to avoid duplicate calls
    const fetchMoreTimeout = setTimeout(() => {
      fetchMore();
    }, 20);

    return () => clearTimeout(fetchMoreTimeout); // Clear timeout on cleanup
  }, [inView, error, entities.length, isFetching]);

  useEffect(() => {
    if (initialDone) return;
    if (!isLoading) setInitialDone(true);
  }, [isLoading]);

  if (!initialDone) return <GridSkeleton />;

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

        {/* Infinite loading measure ref */}
        <div key={entities.length} ref={measureRef} className="h-0 w-0 bg-red-500 relative -mt-[30rem]" />
      </div>

      {/* Can load more, but offline */}
      {!isOnline && !!totalCount && totalCount > entities.length && (
        <div className="w-full mt-4 italic text-muted text-sm text-center">{t('common:offline.load_more')}</div>
      )}
      {/* Loading */}
      {isFetching && totalCount && totalCount > entities.length && !error && (
        <div className="flex space-x-1 justify-center items-center relative top-4 h-0 w-full animate-pulse">
          <span className="sr-only">Loading...</span>
          <div className="h-1 w-3 bg-foreground rounded-full animate-bounce [animation-delay:-0.3s]" />
          <div className="h-1 w-3 bg-foreground rounded-full animate-bounce [animation-delay:-0.15s]" />
          <div className="h-1 w-3 bg-foreground rounded-full animate-bounce" />
        </div>
      )}
      {/* All is loaded */}
      {!isFetching && !error && !!totalCount && totalCount <= entities.length && (
        <div className="opacity-50 w-full text-xl mt-4 text-center">
          <div>&#183;</div>
          <div className="-mt-5">&#183;</div>
          <div className="-mt-5">&#183;</div>
          <div className="-mt-3">&#176;</div>
        </div>
      )}
      {/* Error */}
      {error && <div className="text-center my-8 text-sm text-red-600">{t('error:load_more_failed')}</div>}
    </div>
  );
};
