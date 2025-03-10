import { onlineManager } from '@tanstack/react-query';
import { useLoaderData } from '@tanstack/react-router';
import { forwardRef, memo, useEffect, useImperativeHandle, useState } from 'react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { DataTable } from '~/modules/common/data-table';
import { tablePropsAreEqual } from '~/modules/common/data-table/table-props-are-equal';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import { toaster } from '~/modules/common/toaster';
import type { MemberSearch, MembersTableProps } from '~/modules/memberships/members-table/table-wrapper';
import { membersKeys } from '~/modules/memberships/query';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import type { Member } from '~/modules/memberships/types';
import { queryClient } from '~/query/query-client';
import { OrganizationMembersRoute } from '~/routes/organizations';

type BaseDataTableProps = MembersTableProps &
  BaseTableProps<Member, MemberSearch> & {
    queryVars: { role: MemberSearch['role'] };
  };

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ entity, columns, queryVars, sortColumns, setSortColumns, setSelected }, ref) => {
    const { t } = useTranslation();
    const entityType = entity.entity;
    const organizationId = entity.organizationId || entity.id;

    // Extract query variables and set defaults
    const { q, role, limit } = queryVars;

    // Table state
    const [selectedRows, setSelectedRows] = useState(new Set<string>());

    // Fetching data
    const { data: rows, nextCursor, totalCount, error, isLoading } = useLoaderData({ from: OrganizationMembersRoute.id });

    // 🚀 Flatten paginated data
    useEffect(() => {
      if (!rows) return;

      // Update selected rows
      if (selectedRows.size > 0) {
        setSelectedRows(new Set<string>([...selectedRows].filter((id) => rows.some((row) => row.id === id))));
      }
    }, [rows]);

    const updateMemberMembership = useMemberUpdateMutation();

    // Update rows
    const onRowsChange = (changedRows: Member[], { indexes }: RowsChangeData<Member>) => {
      if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

      // TODO
      // if (column.key !== 'role') return setRows(changedRows);

      // If role is changed, update membership
      for (const index of indexes) {
        updateMemberMembership.mutateAsync(
          { ...changedRows[index].membership, orgIdOrSlug: organizationId, idOrSlug: entity.slug, entityType },
          {
            onSuccess(data, variables, context) {
              queryClient.getMutationDefaults(membersKeys.update()).onSuccess?.(data, variables, context);
              toaster(t('common:success.update_item', { item: t('common:role') }), 'success');
            },
            onError(error, variables, context) {
              queryClient.getMutationDefaults(membersKeys.update()).onError?.(error, variables, context);
            },
          },
        );
      }
      // TODO
      // setRows(changedRows);
    };

    const onSelectedRowsChange = (value: Set<string>) => {
      setSelectedRows(value);
      setSelected(rows.filter((row) => value.has(row.id)));
    };

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => onSelectedRowsChange(new Set<string>()),
    }));

    return (
      // TODO
      // @ts-expect-error
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
          isFetching: isLoading,
          nextCursor,
          isFiltered: role !== undefined || !!q,
          selectedRows,
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange: setSortColumns,
        }}
      />
    );
  }),
  tablePropsAreEqual,
);

export default BaseDataTable;
