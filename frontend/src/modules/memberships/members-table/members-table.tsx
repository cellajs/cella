import { UsersIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig, isUnconditionalCan } from 'shared';
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

export interface MembersTableWrapperProps {
  channel: EnrichedChannel;
  isSheet?: boolean;
}

function MembersTable({ channel, isSheet = false }: MembersTableWrapperProps) {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<MembersRouteSearchParams>({ saveDataInSearch: !isSheet });

  const updateMemberMembership = useMemberUpdateMutation();

  const { id: entityId, entityType, tenantId } = channel;
  const organizationId = channelOrganizationId(channel);

  // Members are managed per channel and the channel has no `createdBy` to resolve `'own'`, so require an unconditional grant.
  const canUpdate = isUnconditionalCan(channel.can?.[channel.entityType]?.update);

  const { q, role, sort, order } = search;

  const [columns, setColumns] = useColumns(canUpdate, isSheet, entityType);
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  // include=counts feeds the per-member insight columns (last post, authored counts, sub-channel memberships);
  // include=mfa feeds the MFA column, which the API fills for the organization's admins only
  const queryOptions = membersListQueryOptions({ entityId, entityType, tenantId, organizationId, ...search, include: 'counts,mfa' });

  const { rows, isLoading, isFetching, error, hasNextPage, fetchMore } = useInfiniteRows(queryOptions);
  const { selected, selectedRowIds, onSelectedRowsChange, clearSelection } = useRowSelection(rows);

  const onRowsChange = (changedRows: Member[], { indexes, column }: RowsChangeData<Member>) => {
    if (column.key !== 'role') return;

    for (const index of indexes) {
      const updatedMembership = {
        path: { id: changedRows[index].membership.id, tenantId, organizationId },
        body: { role: changedRows[index].membership.role },
        channelId: entityId,
        channelType: entityType,
      };

      updateMemberMembership.mutate(updatedMembership);
    }
  };

  return (
    <>
      <MembersTableBar
        channel={channel}
        selected={selected}
        searchVars={{ q, role, sort, order, limit: appConfig.requestLimits.members }}
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
          rows,
          rowHeight: 52,
          onRowsChange,
          rowKeyGetter,
          columns,
          enableVirtualization: true,
          error,
          isLoading,
          isFetching,
          isFiltered: role !== undefined || !!q,
          hasNextPage,
          fetchMore,
          selectedRows: selectedRowIds,
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: (
            <ContentPlaceholder icon={UsersIcon} title="c:no_resource_yet" titleProps={{ resource: t('c:member_other').toLowerCase() }} />
          ),
        }}
      />
    </>
  );
}

export { MembersTable };
