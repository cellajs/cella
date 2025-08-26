import { appConfig } from 'config';
import { useRef, useState } from 'react';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import { usersQueryOptions } from '~/modules/users/query';
import { useColumns } from '~/modules/users/table/columns';
import BaseDataTable from '~/modules/users/table/table';
import { UsersTableBar } from '~/modules/users/table/table-bar';
import type { TableUser } from '~/modules/users/types';
import { UsersTableRoute, type usersSearchSchema } from '~/routes/system';

const LIMIT = appConfig.requestLimits.users;

export type UsersSearch = z.infer<typeof usersSearchSchema>;

const UsersTable = () => {
  const { search, setSearch } = useSearchParams<UsersSearch>({ from: UsersTableRoute.id });
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const { sort, order } = search;
  const limit = LIMIT;

  const queryOptions = usersQueryOptions({ ...search, limit });

  // State for selected
  const [selected, setSelected] = useState<TableUser[]>([]);

  // Build columns
  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
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
        clearSelection={clearSelection}
      />
      <BaseDataTable
        ref={dataTableRef}
        queryOptions={queryOptions}
        columns={columns}
        searchVars={{ ...search, limit }}
        sortColumns={sortColumns}
        setSortColumns={setSortColumns}
        setSelected={setSelected}
      />
    </div>
  );
};

export default UsersTable;
