import { onlineManager } from '@tanstack/react-query';
import { forwardRef, memo, useEffect, useImperativeHandle } from 'react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { queryClient } from '~/lib/router';
import { DataTable } from '~/modules/common/data-table';
import { createToast } from '~/modules/common/toaster';
import type { MemberSearch, MembersTableProps } from '~/modules/memberships/members-table';
import { membersKeys, membersQueryOptions } from '~/modules/memberships/query';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { useDataFromSuspenseInfiniteQuery } from '~/query/hooks/use-data-from-query';
import type { BaseTableMethods, BaseTableProps, Member } from '~/types/common';

type BaseDataTableProps = MembersTableProps &
  BaseTableProps<Member, MemberSearch> & {
    queryVars: { role: MemberSearch['role'] };
  };

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ entity, columns, queryVars, sortColumns, setSortColumns, updateCounts }, ref) => {
    const { t } = useTranslation();
    const entityType = entity.entity;
    const organizationId = entity.organizationId || entity.id;

    // Extract query variables and set defaults
    const { q, role, sort, order, limit } = queryVars;

    // Query members
    const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } =
      useDataFromSuspenseInfiniteQuery(
        membersQueryOptions({
          idOrSlug: entity.slug,
          entityType,
          orgIdOrSlug: organizationId,
          q,
          sort,
          order,
          role,
          limit,
        }),
      );

    const updateMemberMembership = useMemberUpdateMutation();

    // Update rows
    const onRowsChange = (changedRows: Member[], { indexes, column }: RowsChangeData<Member>) => {
      if (!onlineManager.isOnline()) return createToast(t('common:action.offline.text'), 'warning');

      if (column.key !== 'role') return setRows(changedRows);

      // If role is changed, update membership
      for (const index of indexes) {
        updateMemberMembership.mutateAsync(
          { ...changedRows[index].membership, orgIdOrSlug: organizationId, idOrSlug: entity.slug, entityType },
          {
            onSuccess(data, variables, context) {
              queryClient.getMutationDefaults(membersKeys.update()).onSuccess?.(data, variables, context);
              createToast(t('common:success.update_item', { item: t('common:role') }), 'success');
            },
            onError(error, variables, context) {
              queryClient.getMutationDefaults(membersKeys.update()).onError?.(error, variables, context);
              createToast('Error updating role', 'error');
            },
          },
        );
      }
      setRows(changedRows);
    };

    useEffect(() => {
      updateCounts(
        rows.filter((row) => selectedRows.has(row.id)),
        totalCount,
      );
    }, [selectedRows, rows, totalCount]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => setSelectedRows(new Set<string>()),
    }));

    return (
      <DataTable<Member>
        {...{
          columns: columns.filter((column) => column.visible),
          rowHeight: 50,
          enableVirtualization: false,
          onRowsChange,
          rows,
          limit,
          totalCount,
          rowKeyGetter: (row) => row.id,
          error,
          isLoading,
          isFetching,
          fetchMore: fetchNextPage,
          isFiltered: role !== undefined || !!q,
          selectedRows,
          onSelectedRowsChange: setSelectedRows,
          sortColumns,
          onSortColumnsChange: setSortColumns,
        }}
      />
    );
  }),
);

export default BaseDataTable;
