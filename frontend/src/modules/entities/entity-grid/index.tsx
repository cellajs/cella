import { useState } from 'react';
import useSearchParams from '~/hooks/use-search-params';
import { EntityGridBar } from '~/modules/entities/entity-grid/bar';
import { MultipleEntitiesGrid } from '~/modules/entities/entity-grid/grid/multiple';
import { SingleEntityGrid } from '~/modules/entities/entity-grid/grid/single';
import type { BaseEntityGridProps, EntitySearch } from '~/modules/entities/entity-grid/types';

const EntityGridWrapper = (props: BaseEntityGridProps) => {
  const { isSheet = false, userId } = props;
  const { search, setSearch } = useSearchParams<EntitySearch>({ saveDataInSearch: !isSheet });

  const [total, setTotal] = useState<number | undefined>(undefined);

  const isMultiple = 'entities' in props;

  return (
    <div className="flex flex-col gap-4 h-full">
      <EntityGridBar total={total} searchVars={search} countName={isMultiple ? 'entity' : props.entityType} setSearch={setSearch} isSheet={isSheet} />

      {isMultiple ? (
        <MultipleEntitiesGrid entities={props.entities} userId={userId} isSheet={isSheet} searchVars={search} setTotal={setTotal} />
      ) : (
        <SingleEntityGrid
          entityType={props.entityType}
          roles={props.roles}
          userId={userId}
          isSheet={isSheet}
          searchVars={search}
          setTotal={setTotal}
        />
      )}
    </div>
  );
};

export default EntityGridWrapper;
