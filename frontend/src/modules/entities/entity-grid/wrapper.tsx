import type { ContextEntityType } from 'config';
import { useState } from 'react';
import useSearchParams from '~/hooks/use-search-params';
import { EntityGridBar } from '~/modules/entities/entity-grid/bar';
import { BaseEntityGrid, type EntitySearch } from '~/modules/entities/entity-grid/grid';
import type { MembershipRoles } from '~/modules/memberships/types';

// TODO use filterOptions to include roles and userId and possibly other filters in the future
export interface EntityGridWrapperProps {
  entityType: ContextEntityType;
  userId?: string;
  focusView?: boolean;
  saveDataInSearch?: boolean;
  roles?: MembershipRoles[];
  tileComponent?: React.ElementType;
}

const EntityGridWrapper = ({ entityType, userId, roles, focusView = true, saveDataInSearch = true, tileComponent }: EntityGridWrapperProps) => {
  const { search, setSearch } = useSearchParams<EntitySearch>({ saveDataInSearch });

  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);

  return (
    <div className="flex flex-col gap-4 h-full">
      <EntityGridBar totalCount={totalCount} searchVars={search} countName={entityType} setSearch={setSearch} focusView={focusView} />

      <BaseEntityGrid
        entityType={entityType}
        roles={roles}
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
