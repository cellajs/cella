import type { ContextEntityType } from 'config';
import { useState } from 'react';
import useSearchParams from '~/hooks/use-search-params';
import { EntityGridBar } from '~/modules/entities/entity-grid/bar';
import { BaseEntityGrid, type EntitySearch } from '~/modules/entities/entity-grid/grid';
import type { MembershipRoles } from '~/modules/memberships/types';
import { EntityTile } from './tile';

// TODO use filterOptions to include roles and userId and possibly other filters in the future
export interface EntityGridWrapperProps {
  entityType: ContextEntityType;
  roles?: MembershipRoles[];
  isSheet?: boolean;
  userId?: string;
  tileComponent?: React.ElementType;
}

const EntityGridWrapper = (props: EntityGridWrapperProps) => {
  const { isSheet = false, userId } = props;
  const { search, setSearch } = useSearchParams<EntitySearch>({ saveDataInSearch: !isSheet });

  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);

  return (
    <div className="flex flex-col gap-4 h-full">
      <EntityGridBar totalCount={totalCount} searchVars={search} countName={props.entityType} setSearch={setSearch} isSheet={isSheet} />

      <BaseEntityGrid
        entityType={props.entityType}
        roles={props.roles}
        userId={userId}
        isSheet={isSheet}
        searchVars={search}
        totalCount={totalCount}
        setTotalCount={setTotalCount}
        tileComponent={props.tileComponent || EntityTile}
      />
    </div>
  );
};

export default EntityGridWrapper;
