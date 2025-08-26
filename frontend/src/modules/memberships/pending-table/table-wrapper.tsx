import { appConfig } from 'config';
import { useRef } from 'react';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import type { EntityPage } from '~/modules/entities/types';
import { useColumns } from '~/modules/memberships/pending-table/columns';
import BaseDataTable from '~/modules/memberships/pending-table/table';
import { PendingInvitationsTableBar } from '~/modules/memberships/pending-table/table-bar';
import { pendingInvitationsQueryOptions } from '~/modules/memberships/query';
import type { pendingInvitationsSearchSchema } from '~/routes/organizations';

const LIMIT = appConfig.requestLimits.pendingInvitations;

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

  const queryOptions = pendingInvitationsQueryOptions({
    idOrSlug: entity.slug,
    entityType: entity.entityType,
    orgIdOrSlug: entity.organizationId || entity.id,
    ...search,
    limit,
  });

  // Build columns
  const [columns] = useColumns();
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  return (
    <div className="flex flex-col gap-4 h-full">
      <PendingInvitationsTableBar queryKey={queryOptions.queryKey} />
      <BaseDataTable
        ref={dataTableRef}
        columns={columns}
        queryOptions={queryOptions}
        limit={limit}
        sortColumns={sortColumns}
        setSortColumns={setSortColumns}
      />
    </div>
  );
};

export default MembershipInvitationsTable;
