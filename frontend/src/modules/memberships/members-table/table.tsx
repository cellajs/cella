import { forwardRef, memo, useEffect, useImperativeHandle } from 'react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { DataTable } from '~/modules/common/data-table';
import { tablePropsAreEqual } from '~/modules/common/data-table/table-props-are-equal';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import { toaster } from '~/modules/common/toaster';
import type { MemberSearch, MembersTableProps } from '~/modules/memberships/members-table/table-wrapper';
import { useMemberUpdateMutation } from '~/modules/memberships/query/mutations';
import { membersQueryOptions } from '~/modules/memberships/query/options';
import type { Member } from '~/modules/memberships/types';
import { useDataFromInfiniteQuery } from '~/query/hooks/use-data-from-query';

type BaseDataTableProps = MembersTableProps & BaseTableProps<Member, MemberSearch>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ entity, columns, searchVars, sortColumns, setSortColumns, setTotal, setSelected }, ref) => {
    const { t } = useTranslation();
    const entityType = entity.entity;
    const organizationId = entity.organizationId || entity.id;

    // Extract query variables and set defaults
    const { q, role, sort, order, limit } = searchVars;

    // Query members
    const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } = useDataFromInfiniteQuery(
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
      if (column.key !== 'role') return setRows(changedRows);

      // If role is changed, update membership
      for (const index of indexes) {
        updateMemberMembership.mutateAsync(
          { ...changedRows[index].membership, orgIdOrSlug: organizationId, idOrSlug: entity.slug, entityType },
          {
            onSuccess: () => toaster(t('common:success.update_item', { item: t('common:role') }), 'success'),
          },
        );
      }
      setRows(changedRows);
    };

    const onSelectedRowsChange = (value: Set<string>) => {
      setSelectedRows(value);
      setSelected(rows.filter((row) => value.has(row.id)));
    };

    useEffect(() => setTotal(totalCount), [totalCount]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => onSelectedRowsChange(new Set<string>()),
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
