import type { ContextEntityType } from 'config';
import { useState } from 'react';
import useSearchParams from '~/hooks/use-search-params';
import { EntityGridBar } from '~/modules/entities/entity-grid/bar';
import { BaseEntityGrid, type EntitySearch } from '~/modules/entities/entity-grid/grid';
import type { MembershipRoles } from '~/modules/memberships/types';

// TODO use filterOptions to include roles and userId and possibly other filters in the future
export interface EntityGridWrapperProps {
  entityType: ContextEntityType;
  roles?: MembershipRoles[];
  focusView?: boolean;
  userId?: string;
  tileComponent?: React.ElementType;
}

const EntityGridWrapper = (props: EntityGridWrapperProps) => {
  const { userId, focusView = true } = props;
  const { search, setSearch } = useSearchParams<EntitySearch>({ saveDataInSearch: false });

  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);

  return (
    <div className="flex flex-col gap-4 h-full">
      <EntityGridBar totalCount={totalCount} searchVars={search} countName={props.entityType} setSearch={setSearch} focusView={focusView} />

      <BaseEntityGrid
        entityType={props.entityType}
        roles={props.roles}
        userId={userId}
        searchVars={search}
        totalCount={totalCount}
        setTotalCount={setTotalCount}
        tileComponent={props.tileComponent}
      />
    </div>
  );
};

export default EntityGridWrapper;
