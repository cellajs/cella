import { useInfiniteQuery } from '@tanstack/react-query';
import { appConfig } from 'config';
import { useCallback, useState } from 'react';
import useSearchParams from '~/hooks/use-search-params';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { usersQueryOptions } from '~/modules/users/query';
import type { UsersRouteSearchParams, UserWithRole } from '~/modules/users/types';
import { UsersTableBar } from './bar';
import { useColumns } from './columns';

const LIMIT = appConfig.requestLimits.users;

const UsersTable = () => {
  const { search, setSearch } = useSearchParams<UsersRouteSearchParams>({ from: '/appLayout/system/users' });

  // Table state
  const { q, role, sort, order } = search;
  const limit = LIMIT;

  // Build columns
  const [selected, setSelected] = useState<UserWithRole[]>([]);
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

  const onSelectedRowsChange = (value: Set<string>) => {
    if (rows) setSelected(rows.filter((row) => value.has(row.id)));
  };

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
      <DataTable<UserWithRole>
        {...{
          rows,
          rowHeight: 52,
          rowKeyGetter: (row) => row.id,
          columns: columns.filter((column) => column.visible),
          enableVirtualization: false,
          limit,
          error,
          isLoading,
          isFetching,
          isFiltered: role !== undefined || !!q,
          hasNextPage,
          fetchMore,
          selectedRows: new Set(selected.map((s) => s.id)),
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
        }}
      />
    </div>
  );
};

export default UsersTable;
