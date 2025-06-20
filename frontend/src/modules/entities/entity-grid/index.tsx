import type { contextEntitiesQuerySchema } from '#/modules/entities/schema';
import type { ContextEntityType } from 'config';
import { useState } from 'react';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { EntityGridBar } from '~/modules/entities/entity-grid/bar';
import { MultipleEntitiesGrid } from '~/modules/entities/entity-grid/grid/multiple';
import { SingleEntityGrid } from '~/modules/entities/entity-grid/grid/single';
import type { MembershipRoles } from '~/modules/memberships/types';

export type EntitySearch = Pick<z.infer<typeof contextEntitiesQuerySchema>, 'sort' | 'q'>;

export interface BaseEntityGridProps {
  entities: { entityType: ContextEntityType; roles?: MembershipRoles[] }[];
  isSheet?: boolean;
  userId?: string;
}

const EntityGridWrapper = ({ entities, userId, isSheet = false }: BaseEntityGridProps) => {
  const { search, setSearch } = useSearchParams<EntitySearch>({ saveDataInSearch: !isSheet });

  const [total, setTotal] = useState<number | undefined>(undefined);

  return (
    <div className="flex flex-col gap-4 h-full">
      <EntityGridBar
        total={total}
        searchVars={search}
        countName={entities.length === 1 ? entities[0].entityType : 'entity'}
        setSearch={setSearch}
        isSheet={isSheet}
      />
      {entities.length === 1 ? (
        <SingleEntityGrid
          entityType={entities[0].entityType}
          roles={entities[0].roles}
          userId={userId}
          isSheet={isSheet}
          searchVars={search}
          setTotal={setTotal}
        />
      ) : (
        <MultipleEntitiesGrid entities={entities} userId={userId} isSheet={isSheet} searchVars={search} setTotal={setTotal} />
      )}
    </div>
  );
};

export default EntityGridWrapper;
