import { config } from 'config';
import { useRef, useState } from 'react';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import type { EntityPage } from '~/modules/general/types';
import { useColumns } from '~/modules/memberships/invited-members-table/columns';
import BaseDataTable from '~/modules/memberships/invited-members-table/table';
import { InvitedMembersTableBar } from '~/modules/memberships/invited-members-table/table-bar';
import type { InvitedMember } from '~/modules/memberships/types';
import type { invitedMembersSearchSchema } from '~/routes/organizations';
import { arraysHaveSameElements } from '~/utils';

export type InvitedMembersSearch = z.infer<typeof invitedMembersSearchSchema>;

export interface InvitedMembersTableProps {
  entity: EntityPage;
}

export const InvitedMembersTable = ({ entity }: InvitedMembersTableProps) => {
  const { search, setSearch } = useSearchParams<InvitedMembersSearch>({ saveDataInSearch: false });

  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const { sort, order } = search;

  // State for selected and total counts
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<InvitedMember[]>([]);

  // Update total and selected counts
  const updateCounts = (newSelected: InvitedMember[], newTotal: number | undefined) => {
    if (newTotal !== total) setTotal(newTotal);
    if (!arraysHaveSameElements(selected, newSelected)) setSelected(newSelected);
  };

  // Build columns
  const [columns] = useColumns();
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  return (
    <div className="flex flex-col gap-4 h-full">
      <InvitedMembersTableBar total={total} />
      <BaseDataTable
        ref={dataTableRef}
        entity={entity}
        columns={columns}
        queryVars={{ sort, order, limit: config.requestLimits.invitedMembers }}
        updateCounts={updateCounts}
        sortColumns={sortColumns}
        setSortColumns={setSortColumns}
      />
    </div>
  );
};

export default InvitedMembersTable;
