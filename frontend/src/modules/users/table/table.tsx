import { onlineManager } from '@tanstack/react-query';
import { forwardRef, memo, useCallback, useImperativeHandle } from 'react';

import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { DataTable } from '~/modules/common/data-table';
import { tablePropsAreEqual } from '~/modules/common/data-table/table-props-are-equal';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import { toaster } from '~/modules/common/toaster/service';
import { type usersQueryOptions, useUpdateUserMutation } from '~/modules/users/query';
import type { UsersSearch } from '~/modules/users/table/table-wrapper';
import type { TableUser } from '~/modules/users/types';
import { useDataFromInfiniteQuery } from '~/query/hooks/use-data-from-query';

type BaseDataTableProps = BaseTableProps<TableUser, UsersSearch, ReturnType<typeof usersQueryOptions>>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ columns, queryOptions, searchVars, sortColumns, setSortColumns, setSelected }, ref) => {
    const { t } = useTranslation();

    // Extract query variables
    const { q, role, limit } = searchVars;

    // Query users
    const { rows, selectedRows, setRows, setSelectedRows, isLoading, isFetching, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
      useDataFromInfiniteQuery(queryOptions);

    // Update user role
    const { mutate: updateUserRole } = useUpdateUserMutation();

    // Update user role
    const onRowsChange = (changedRows: TableUser[], { indexes, column }: RowsChangeData<TableUser>) => {
      if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');
      for (const index of indexes)
        if (column.key === 'role') {
          const newUser = changedRows[index];
          const updateInfo = { idOrSlug: newUser.id, role: newUser.role };
          updateUserRole(updateInfo, {
            onSuccess: () => toaster(t('common:success.update_item', { item: t('common:role') }), 'success'),
          });
        }
      setRows(changedRows);
    };

    const fetchMore = useCallback(async () => {
      if (!hasNextPage || isLoading || isFetching || isFetchingNextPage) return;
      await fetchNextPage();
    }, [hasNextPage, isLoading, isFetching, isFetchingNextPage]);

    const onSelectedRowsChange = (value: Set<string>) => {
      setSelectedRows(value);
      setSelected(rows.filter((row) => value.has(row.id)));
    };

    const onSortColumnsChange = (sortColumns: SortColumn[]) => {
      setSortColumns(sortColumns);
      onSelectedRowsChange(new Set<string>());
    };

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => onSelectedRowsChange(new Set<string>()),
    }));

    return (
      <DataTable<TableUser>
        {...{
          columns: columns.filter((column) => column.visible),
          rowHeight: 52,
          enableVirtualization: false,
          onRowsChange,
          rows,
          limit,
          rowKeyGetter: (row) => row.id,
          error,
          isLoading,
          isFetching,
          hasNextPage,
          fetchMore,
          isFiltered: role !== undefined || !!q,
          selectedRows,
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
        }}
      />
    );
  }),
  tablePropsAreEqual,
);

export default BaseDataTable;
