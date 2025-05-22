import { config } from 'config';
import { useRef, useState } from 'react';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import type { EntityPage } from '~/modules/entities/types';
import { useColumns } from '~/modules/memberships/pending-table/columns';
import BaseDataTable from '~/modules/memberships/pending-table/table';
import { MembershipInvitationsTableBar } from '~/modules/memberships/pending-table/table-bar';
import type { pendingInvitationsSearchSchema } from '~/routes/organizations';

const LIMIT = config.requestLimits.pendingInvitations;

export type MembershipInvitationsSearch = z.infer<typeof pendingInvitationsSearchSchema>;

export interface MembershipInvitationsTableProps {
  entity: EntityPage;
}

export const MembershipInvitationsTable = ({ entity }: MembershipInvitationsTableProps) => {
  const { search, setSearch } = useSearchParams<MembershipInvitationsSearch>({ saveDataInSearch: false });
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const { sort, order } = search;
  const limit = LIMIT;

  // State for selected and total counts
  const [total, setTotal] = useState<number | undefined>(undefined);

  // Build columns
  const [columns] = useColumns(entity);
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  return (
    <div className="flex flex-col gap-4 h-full">
      <MembershipInvitationsTableBar total={total} />
      <BaseDataTable
        ref={dataTableRef}
        entity={entity}
        columns={columns}
        searchVars={{ ...search, limit }}
        sortColumns={sortColumns}
        setSortColumns={setSortColumns}
        setTotal={setTotal}
      />
    </div>
  );
};

export default MembershipInvitationsTable;
