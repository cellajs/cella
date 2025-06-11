import type { ContextEntityType } from 'config';
import { useState } from 'react';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { EntityGrid } from '~/modules/entities/entity-grid';
import { EntityGridBar } from '~/modules/entities/entity-grid-bar';
import type { contextEntitiesQuerySchema } from '#/modules/entities/schema';

export type EntitySearch = Pick<z.infer<typeof contextEntitiesQuerySchema>, 'sort' | 'q'>;

export interface BaseEntityGridProps {
  entityType: ContextEntityType;
  isSheet?: boolean;
  userId?: string;
}

const EntityGridWrapper = ({ entityType, userId, isSheet = false }: BaseEntityGridProps) => {
  const { search, setSearch } = useSearchParams<EntitySearch>({ saveDataInSearch: !isSheet });

  const [total, setTotal] = useState<number | undefined>(undefined);

  return (
    <div className="flex flex-col gap-4 h-full">
      <EntityGridBar total={total} searchVars={search} entityType={entityType} setSearch={setSearch} isSheet={isSheet} />
      <EntityGrid entityType={entityType} userId={userId} isSheet={isSheet} searchVars={search} setTotal={setTotal} />
    </div>
  );
};

export default EntityGridWrapper;
