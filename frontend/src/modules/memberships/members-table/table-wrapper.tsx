import { config } from 'config';
import { useRef, useState } from 'react';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import type { EntityPage } from '~/modules/entities/types';
import { useColumns } from '~/modules/memberships/members-table/columns';
import BaseDataTable from '~/modules/memberships/members-table/table';
import { MembersTableBar } from '~/modules/memberships/members-table/table-bar';
import type { Member } from '~/modules/memberships/types';
import type { membersSearchSchema } from '~/routes/organizations';

const LIMIT = config.requestLimits.members;

export type MemberSearch = z.infer<typeof membersSearchSchema>;
export interface MembersTableProps {
  entity: EntityPage;
  isSheet?: boolean;
}

const MembersTable = ({ entity, isSheet = false }: MembersTableProps) => {
  const { search, setSearch } = useSearchParams<MemberSearch>({ saveDataInSearch: !isSheet });

  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // TODO we should create an entity page zustand store to keep this data in sync. so when pending, role or else changes, we can rerender this
  const isAdmin = entity.membership?.role === 'admin';

  // Table state
  const { sort, order } = search;
  const limit = LIMIT;

  // State for selected, total counts and entity
  const [total, setTotal] = useState<number | undefined>(undefined);
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
        total={total}
        selected={selected}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
        clearSelection={clearSelection}
        isSheet={isSheet}
      />
      <BaseDataTable
        entity={entity}
        ref={dataTableRef}
        columns={columns}
        searchVars={{ ...search, limit }}
        sortColumns={sortColumns}
        setSortColumns={setSortColumns}
        setTotal={setTotal}
        setSelected={setSelected}
      />
    </div>
  );
};

export default MembersTable;
