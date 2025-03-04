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
import type { invitedMembersSearchSchema } from '~/routes/organizations';

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
        sortColumns={sortColumns}
        setSortColumns={setSortColumns}
        setTotal={setTotal}
      />
    </div>
  );
};

export default InvitedMembersTable;
