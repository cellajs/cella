import type { ContextEntityType } from 'config';
import useSearchParams from '~/hooks/use-search-params';
import { EntityGridBar } from '~/modules/entities/entity-grid/bar';
import { BaseEntityGrid, type EntitySearch } from '~/modules/entities/entity-grid/grid';
import { contextEntitiesListQueryOptions } from '~/modules/entities/query';

export interface EntityGridWrapperProps {
  entityType: ContextEntityType;
  label: string;
  userId?: string;
  focusView?: boolean;
  saveDataInSearch?: boolean;
  tileComponent?: React.ElementType;
}

const EntityGrid = ({ entityType, label, userId, focusView = true, saveDataInSearch = true, tileComponent }: EntityGridWrapperProps) => {
  const { search, setSearch } = useSearchParams<EntitySearch>({ saveDataInSearch });

  const queryOptions = contextEntitiesListQueryOptions({ ...search, types: [entityType], targetUserId: userId });

  return (
    <div className="flex flex-col gap-4 h-full">
      <EntityGridBar queryKey={queryOptions.queryKey} searchVars={search} label={label} setSearch={setSearch} focusView={focusView} />

      <BaseEntityGrid queryOptions={queryOptions} entityType={entityType} label={label} searchVars={search} tileComponent={tileComponent} />
    </div>
  );
};

export default EntityGrid;
