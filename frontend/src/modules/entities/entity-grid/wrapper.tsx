import type { ContextEntityType } from 'config';
import { useState } from 'react';
import useSearchParams from '~/hooks/use-search-params';
import { EntityGridBar } from '~/modules/entities/entity-grid/bar';
import { BaseEntityGrid, EntitySearch } from '~/modules/entities/entity-grid/grid';
import type { MembershipRoles } from '~/modules/memberships/types';

export interface EntityGridWrapperProps {
  entityType: ContextEntityType;
  roles?: MembershipRoles[];
  isSheet?: boolean;
  userId?: string;
}

const EntityGridWrapper = (props: EntityGridWrapperProps) => {
  const { isSheet = false, userId } = props;
  const { search, setSearch } = useSearchParams<EntitySearch>({ saveDataInSearch: !isSheet });

  const [total, setTotal] = useState<number | undefined>(undefined);

  return (
    <div className="flex flex-col gap-4 h-full">
      <EntityGridBar total={total} searchVars={search} countName={props.entityType} setSearch={setSearch} isSheet={isSheet} />

      <BaseEntityGrid
        entityType={props.entityType}
        roles={props.roles}
        userId={userId}
        isSheet={isSheet}
        searchVars={search}
        setTotal={setTotal}
      />
    </div>
  );
};

export default EntityGridWrapper;
