import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { BaseEntityGridProps, EntitySearch } from '~/modules/entities/entity-grid';
import { EntityItem } from '~/modules/entities/entity-grid/item';
import { SingleGridSkeleton } from '~/modules/entities/entity-grid/skeleton/single';
import { contextEntitiesQueryOptions } from '~/modules/entities/query';

type GridEntityProps = BaseEntityGridProps['entities'][number];
type Props = Omit<BaseEntityGridProps, 'entities'> &
  GridEntityProps & {
    searchVars: EntitySearch;
    setTotal: (newTotal?: number) => void;
  };

export const SingleEntityGrid = ({ entityType, roles, userId, searchVars, setTotal }: Props) => {
  const [initialDone, setInitialDone] = useState(false);

  const {
    data: entities = [],
    isLoading,
    isFetching,
  } = useQuery(contextEntitiesQueryOptions({ ...searchVars, roles, type: entityType, targetUserId: userId }));

  useEffect(() => {
    if (isFetching) return;
    setTotal(entities.length);
  }, [entities.length, isFetching]);

  useEffect(() => {
    if (initialDone) return;
    if (!isLoading) setInitialDone(true);
  }, [isLoading]);

  if (!initialDone) return <SingleGridSkeleton entityType={entityType} />;
  return (
    <div className="mb-12 grid gap-6 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(330px,1fr))]">
      {entities.map((entity) => (
        <EntityItem key={entity.id} entity={entity} />
      ))}
    </div>
  );
};
