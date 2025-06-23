import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { EntityTile } from '~/modules/entities/entity-grid/tile';
import { GridSkeleton } from '~/modules/entities/entity-grid/skeleton';
import { contextEntitiesQueryOptions } from '~/modules/entities/query';
import { EntityGridWrapperProps } from './wrapper';
import z from 'zod/v4';
import { contextEntitiesQuerySchema } from '#/modules/entities/schema';

export type EntitySearch = Pick<z.infer<typeof contextEntitiesQuerySchema>, 'sort' | 'q'>;

interface Props extends EntityGridWrapperProps {
  searchVars: EntitySearch;
  setTotal: (newTotal?: number) => void;
}

export const BaseEntityGrid = ({ entityType, roles, userId, searchVars, setTotal }: Props) => {
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

  if (!initialDone) return <GridSkeleton />;

  return (
    <div className="mb-12 grid gap-6 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(330px,1fr))]">
      {entities.map((entity) => (
        <EntityTile key={entity.id} entity={entity} />
      ))}
    </div>
  );
};
