import { config } from 'config';
import { lazy, useRef, useState } from 'react';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { useColumns } from '~/modules/memberships/invited-members-table/columns';
import { InvitesInfoHeader } from '~/modules/memberships/invited-members-table/table-header';
import type { invitedMembersSearchSchema } from '~/routes/organizations';
import type { BaseTableMethods, EntityPage, InvitedMemberInfo } from '~/types/common';
import { arraysHaveSameElements } from '~/utils';

const BaseDataTable = lazy(() => import('~/modules/memberships/invited-members-table/table'));

export type InvitesInfoSearch = z.infer<typeof invitedMembersSearchSchema>;
export interface InvitedMembersTableProps {
  entity: EntityPage;
}

export const InvitedMembersTable = ({ entity }: InvitedMembersTableProps) => {
  const { search, setSearch } = useSearchParams<InvitesInfoSearch>({ saveDataInSearch: false });

  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const { q, role, sort, order } = search;

  // State for selected and total counts
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<InvitedMemberInfo[]>([]);

  // Update total and selected counts
  const updateCounts = (newSelected: InvitedMemberInfo[], newTotal: number | undefined) => {
    if (newTotal !== total) setTotal(newTotal);
    if (!arraysHaveSameElements(selected, newSelected)) setSelected(newSelected);
  };

  // Build columns
  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <InvitesInfoHeader
        total={total}
        selected={selected}
        columns={columns}
        q={q ?? ''}
        role={role}
        setSearch={setSearch}
        setColumns={setColumns}
        clearSelection={clearSelection}
      />
      <BaseDataTable
        ref={dataTableRef}
        entity={entity}
        columns={columns}
        queryVars={{ q, role, sort, order, limit: config.requestLimits.invitedMembers }}
        updateCounts={updateCounts}
        sortColumns={sortColumns}
        setSortColumns={setSortColumns}
      />
    </div>
  );
};

export default InvitedMembersTable;
