import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ColumnSkeleton } from '~/modules/entities/entity-grid-skeleton';
import type { BaseEntityGridProps, EntitySearch } from '~/modules/entities/entity-grid-wrapper';
import { EntityTile } from '~/modules/entities/entity-tile';
import { contextEntitiesQueryOptions } from '~/modules/entities/query';

type Props = BaseEntityGridProps & {
  searchVars: EntitySearch;
  setTotal: (newTotal?: number) => void;
};

export const EntityGrid = ({ entityType, userId, searchVars, setTotal }: Props) => {
  const { data: entities, isFetching } = useQuery(contextEntitiesQueryOptions({ ...searchVars, type: entityType, targetUserId: userId }));

  useEffect(() => setTotal(entities?.length), [entities]);

  if (isFetching) return <ColumnSkeleton entityType={entityType} />;
  return (
    <div className="mb-12 grid gap-6 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(330px,1fr))]">
      {entities?.map((entity) => (
        <EntityTile key={entity.id} entity={entity} />
      ))}
    </div>
  );
};
