import { useInfiniteQuery } from '@tanstack/react-query';
import { appConfig } from 'config';
import { useCallback, useMemo, useState } from 'react';
import useSearchParams from '~/hooks/use-search-params';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { usersQueryOptions } from '~/modules/users/query';
import { UsersTableBar } from '~/modules/users/table/users-bar';
import { useColumns } from '~/modules/users/table/users-columns';
import type { UsersRouteSearchParams, UserWithRoleAndMemberships } from '~/modules/users/types';

const LIMIT = appConfig.requestLimits.users;

/** Stable row key getter function - defined outside component to prevent re-renders */
function rowKeyGetter(row: UserWithRoleAndMemberships) {
  return row.id;
}

function UsersTable() {
  const { search, setSearch } = useSearchParams<UsersRouteSearchParams>({ from: '/appLayout/system/users' });

  // Table state
  const { q, role, sort, order } = search;
  const limit = LIMIT;

  // Build columns
  const [selected, setSelected] = useState<UserWithRoleAndMemberships[]>([]);
  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = usersQueryOptions({ ...search, limit });
  const {
    data: rows,
    isLoading,
    isFetching,
    error,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    ...queryOptions,
    select: ({ pages }) => pages.flatMap(({ items }) => items),
  });

  // isFetching already includes next page fetch scenario
  const fetchMore = useCallback(async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  }, [hasNextPage, isLoading, isFetching]);

  // Memoize callback to prevent unnecessary re-renders
  const onSelectedRowsChange = useCallback(
    (value: Set<string>) => {
      if (rows) setSelected(rows.filter((row) => value.has(row.id)));
    },
    [rows],
  );

  // Memoize the Set of selected row IDs to prevent unnecessary re-renders
  const selectedRowIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  // Memoize visible columns to prevent recalculation on every render
  const visibleColumns = useMemo(() => columns.filter((column) => column.visible), [columns]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <UsersTableBar
        queryKey={queryOptions.queryKey}
        selected={selected}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
        clearSelection={() => setSelected([])}
      />
      <DataTable<UserWithRoleAndMemberships>
        {...{
          rows,
          rowHeight: 52,
          rowKeyGetter,
          columns: visibleColumns,
          enableVirtualization: true,
          limit,
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
        }}
      />
    </div>
  );
}

export default UsersTable;
