import { UsersIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isUnconditionalCan } from 'shared';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import type { RowsChangeData } from '~/modules/common/data-grid';
import { DataTable } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { useInfiniteRows } from '~/modules/common/data-table/use-infinite-rows';
import { useRowSelection } from '~/modules/common/data-table/use-row-selection';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import type { EnrichedChannel } from '~/modules/entities/types';
import { MembersTableBar } from '~/modules/memberships/members-table/members-bar';
import { useColumns } from '~/modules/memberships/members-table/members-columns';
import { membersListQueryOptions } from '~/modules/memberships/query';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import type { Member, MembersRouteSearchParams } from '~/modules/memberships/types';

function rowKeyGetter(row: Member) {
  return row.id;
}

export interface MembersTableProps {
  channel: EnrichedChannel;
  isSheet?: boolean;
}

export function MembersTable({ channel, isSheet = false }: MembersTableProps) {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<MembersRouteSearchParams>({ saveDataInSearch: !isSheet });

  const { mutate: updateMembership } = useMemberUpdateMutation();

  const { id: entityId, entityType, tenantId } = channel;
  const organizationId = channelOrganizationId(channel);

  // Members are managed per channel and the channel has no `createdBy` to resolve `'own'`, so require an unconditional grant.
  const canUpdate = isUnconditionalCan(channel.can?.[channel.entityType]?.update);

  const { q, role, sort, order } = search;

  const [columns, setColumns] = useColumns(canUpdate, isSheet, entityType);
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  // `counts` and `mfa` feed the insight and MFA columns
  const queryOptions = membersListQueryOptions({ entityId, entityType, tenantId, organizationId, ...search, include: 'counts,mfa' });

  const list = useInfiniteRows(queryOptions);
  const { selected, selectedRowIds, onSelectedRowsChange, clearSelection } = useRowSelection(list.rows);

  const onRowsChange = (changedRows: Member[], { indexes, column }: RowsChangeData<Member>) => {
    if (column.key !== 'role') return;

    for (const index of indexes) {
      const { membership } = changedRows[index];
      updateMembership({
        path: { id: membership.id, tenantId, organizationId },
        body: { role: membership.role },
        channelId: entityId,
        channelType: entityType,
      });
    }
  };

  return (
    <>
      <MembersTableBar
        channel={channel}
        selected={selected}
        searchVars={{ q, role, sort, order }}
        setSearch={setSearch}
        queryKey={queryOptions.queryKey}
        columns={columns}
        setColumns={setColumns}
        clearSelection={clearSelection}
        isSheet={isSheet}
        canUpdate={canUpdate}
      />
      <DataTable<Member>
        {...{
          ...list,
          onRowsChange,
          rowKeyGetter,
          columns,
          enableVirtualization: true,
          isFiltered: role !== undefined || !!q,
          selectedRows: selectedRowIds,
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: (
            <ContentPlaceholder icon={UsersIcon} title="c:no_resource_yet" titleOptions={{ resource: t('c:member_other').toLowerCase() }} />
          ),
        }}
      />
    </>
  );
}
