import { appConfig } from 'config';
import { useRef, useState } from 'react';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import type { EntityPage } from '~/modules/entities/types';
import { useColumns } from '~/modules/memberships/members-table/columns';
import BaseDataTable from '~/modules/memberships/members-table/table';
import { MembersTableBar } from '~/modules/memberships/members-table/table-bar';
import { membersQueryOptions } from '~/modules/memberships/query';
import type { Member } from '~/modules/memberships/types';
import type { membersSearchSchema } from '~/routes/organizations';

const LIMIT = appConfig.requestLimits.members;

export type MemberSearch = z.infer<typeof membersSearchSchema>;
export interface MembersTableWrapperProps {
  entity: EntityPage;
  isSheet?: boolean;
  children?: React.ReactNode;
}

const MembersTable = ({ entity, isSheet = false, children }: MembersTableWrapperProps) => {
  const { search, setSearch } = useSearchParams<MemberSearch>({ saveDataInSearch: !isSheet });

  const dataTableRef = useRef<BaseTableMethods | null>(null);

  const entityType = entity.entityType;
  const organizationId = entity.organizationId || entity.id;
  const isAdmin = entity.membership?.role === 'admin';

  // Table state
  const { sort, order } = search;
  const limit = LIMIT;

  const queryOptions = membersQueryOptions({
    idOrSlug: entity.slug,
    entityType,
    orgIdOrSlug: organizationId,
    ...search,
    limit,
  });

  // State for selected
  const [selected, setSelected] = useState<Member[]>([]);

  // Build columns
  const [columns, setColumns] = useColumns(isAdmin, isSheet);
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <MembersTableBar
        entity={entity}
        selected={selected}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        queryKey={queryOptions.queryKey}
        columns={columns}
        setColumns={setColumns}
        clearSelection={clearSelection}
        isSheet={isSheet}
      />
      {children}
      <BaseDataTable
        entity={entity}
        queryOptions={queryOptions}
        ref={dataTableRef}
        columns={columns}
        searchVars={{ ...search, limit }}
        sortColumns={sortColumns}
        setSortColumns={setSortColumns}
        setSelected={setSelected}
      />
    </div>
  );
};

export default MembersTable;
