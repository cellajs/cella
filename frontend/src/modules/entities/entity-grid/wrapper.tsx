import type { ContextEntityType } from 'config';
import { useState } from 'react';
import useSearchParams from '~/hooks/use-search-params';
import { EntityGridBar } from '~/modules/entities/entity-grid/bar';
import { BaseEntityGrid, type EntitySearch } from '~/modules/entities/entity-grid/grid';

export interface EntityGridWrapperProps {
  entityType: ContextEntityType;
  label: string;
  userId?: string;
  focusView?: boolean;
  saveDataInSearch?: boolean;
  tileComponent?: React.ElementType;
}

const EntityGridWrapper = ({ entityType, label, userId, focusView = true, saveDataInSearch = true, tileComponent }: EntityGridWrapperProps) => {
  const { search, setSearch } = useSearchParams<EntitySearch>({ saveDataInSearch });

  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);

  return (
    <div className="flex flex-col gap-4 h-full">
      <EntityGridBar totalCount={totalCount} searchVars={search} label={label} setSearch={setSearch} focusView={focusView} />

      <BaseEntityGrid
        entityType={entityType}
        label={label}
        userId={userId}
        searchVars={search}
        totalCount={totalCount}
        setTotalCount={setTotalCount}
        tileComponent={tileComponent}
      />
    </div>
  );
};

export default EntityGridWrapper;
