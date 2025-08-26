import { appConfig } from 'config';
import { useRef, useState } from 'react';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import { requestsQueryOptions } from '~/modules/requests/query';
import { useColumns } from '~/modules/requests/table/columns';
import BaseDataTable from '~/modules/requests/table/table';
import { RequestsTableBar } from '~/modules/requests/table/table-bar';
import type { Request } from '~/modules/requests/types';
import { RequestsTableRoute, type requestSearchSchema } from '~/routes/system';

const LIMIT = appConfig.requestLimits.requests;

export type RequestsSearch = z.infer<typeof requestSearchSchema>;

const RequestsTable = () => {
  const { search, setSearch } = useSearchParams<RequestsSearch>({ from: RequestsTableRoute.id });
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const { sort, order } = search;
  const limit = LIMIT;

  const queryOptions = requestsQueryOptions({ ...search, limit });

  // State for selected
  const [selected, setSelected] = useState<Request[]>([]);

  // Build columns
  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <RequestsTableBar
        queryKey={queryOptions.queryKey}
        selected={selected}
        columns={columns}
        setColumns={setColumns}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        clearSelection={clearSelection}
      />
      <BaseDataTable
        ref={dataTableRef}
        columns={columns}
        queryOptions={queryOptions}
        searchVars={{ ...search, limit }}
        sortColumns={sortColumns}
        setSortColumns={setSortColumns}
        setSelected={setSelected}
      />
    </div>
  );
};

export default RequestsTable;
