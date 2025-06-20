import { useQueries } from '@tanstack/react-query';
import { t } from 'i18next';
import { Fragment, useEffect, useState } from 'react';
import type { BaseEntityGridProps, EntitySearch } from '~/modules/entities/entity-grid';
import { EntityItem } from '~/modules/entities/entity-grid/item';
import { MultipleGridSkeleton } from '~/modules/entities/entity-grid/skeleton/multiple';
import { contextEntitiesQueryOptions } from '~/modules/entities/query';

type Props = BaseEntityGridProps & {
  searchVars: EntitySearch;
  setTotal: (newTotal?: number) => void;
};

export const MultipleEntitiesGrid = ({ entities: passedEntities, userId, searchVars, setTotal }: Props) => {
  const [initialDone, setInitialDone] = useState(false);

  const {
    entitiesData = [],
    isLoading,
    isFetching,
  } = useQueries({
    queries: passedEntities.map(({ roles, entityType }) =>
      contextEntitiesQueryOptions({ ...searchVars, roles, type: entityType, targetUserId: userId }),
    ),
    combine: (results) => ({
      entitiesData: results.map(({ data }) => data).filter((entity) => entity !== undefined),
      isLoading: results.some(({ isLoading }) => isLoading),
      isFetching: results.some(({ isFetching }) => isFetching),
    }),
  });

  useEffect(() => {
    if (isFetching) return;
    setTotal(entitiesData.flat().length);
  }, [entitiesData.length, isFetching]);

  useEffect(() => {
    if (initialDone) return;
    if (!isLoading) setInitialDone(true);
  }, [isLoading]);

  if (!initialDone) return <MultipleGridSkeleton passedEntities={passedEntities} />;
  return (
    <>
      {entitiesData.map((entities, index) => (
        <Fragment key={passedEntities[index].entityType}>
          <span>{t(passedEntities[index].entityType, { ns: ['app', 'common'] })}</span>

          <div className="mb-12 grid gap-6 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(330px,1fr))]">
            {entities.map((entity) => (
              <EntityItem key={entity.id} entity={entity} />
            ))}
          </div>
        </Fragment>
      ))}
    </>
  );
};
