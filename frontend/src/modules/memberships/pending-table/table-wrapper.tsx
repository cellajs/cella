import { config } from 'config';
import { useRef, useState } from 'react';
import type { z } from 'zod/v4';
import useSearchParams from '~/hooks/use-search-params';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import type { EntityPage } from '~/modules/entities/types';
import { useColumns } from '~/modules/memberships/pending-table/columns';
import BaseDataTable from '~/modules/memberships/pending-table/table';
import { PendingInvitationsTableBar } from '~/modules/memberships/pending-table/table-bar';
import type { pendingInvitationsSearchSchema } from '~/routes/organizations';

const LIMIT = config.requestLimits.pendingInvitations;

export type PendingInvitationsSearch = z.infer<typeof pendingInvitationsSearchSchema>;

export interface PendingInvitationsTableProps {
  entity: EntityPage;
}

/**
 * Renders a button that opens a sheet with pending membership invitations.
 *
 * To make this component work properly in your app, make sure that:
 *  - Passed entity has `invitesCount` field, like it's done in organization.
 *  - Query key factory is set up for this entity type, similar to `organizationsKeys.single`.
 */
export const MembershipInvitationsTable = ({ entity }: PendingInvitationsTableProps) => {
  const { search, setSearch } = useSearchParams<PendingInvitationsSearch>({ saveDataInSearch: false });
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
      <PendingInvitationsTableBar total={total} />
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
