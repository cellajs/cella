import { useSearchParams } from '~/hooks/use-search-params';
import { DataTable } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { useInfiniteRows } from '~/modules/common/data-table/use-infinite-rows';
import { useRowSelection } from '~/modules/common/data-table/use-row-selection';
import { usersListQueryOptions } from '~/modules/user/query';
import { UsersTableBar } from '~/modules/user/table/users-bar';
import { useColumns } from '~/modules/user/table/users-columns';
import type { BaseUser, UsersRouteSearchParams } from '~/modules/user/types';

function rowKeyGetter(row: BaseUser) {
  return row.id;
}

export function UsersTable() {
  const { search, setSearch } = useSearchParams<UsersRouteSearchParams>({ from: '/_app/system/users' });

  const { q, role, sort, order } = search;

  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = usersListQueryOptions(search);
  const list = useInfiniteRows(queryOptions);
  const { selected, selectedRowIds, onSelectedRowsChange, clearSelection } = useRowSelection(list.rows);

  return (
    <>
      <UsersTableBar
        queryKey={queryOptions.queryKey}
        selected={selected}
        searchVars={{ q, role, sort, order }}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
        clearSelection={clearSelection}
      />
      <DataTable<BaseUser>
        {...{
          ...list,
          rowKeyGetter,
          columns,
          enableVirtualization: true,
          isFiltered: role !== undefined || !!q,
          selectedRows: selectedRowIds,
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
        }}
      />
    </>
  );
}
