import { config } from 'config';
import { Suspense, lazy, useRef, useState } from 'react';
import type { z } from 'zod';
import { getRequests } from '~/api/requests';
import useSearchParams from '~/hooks/use-search-params';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { useColumns } from '~/modules/system/requests-table/columns';
import { RequestsTableHeaderBar } from '~/modules/system/requests-table/table-header';
import { RequestsTableRoute, type requestSearchSchema } from '~/routes/system';
import type { BaseTableMethods, Request } from '~/types/common';
import { arraysHaveSameElements } from '~/utils';

const BaseDataTable = lazy(() => import('~/modules/system/requests-table/table'));
const LIMIT = config.requestLimits.requests;

export type RequestsSearch = z.infer<typeof requestSearchSchema>;

const RequestsTable = () => {
  const { search, setSearch } = useSearchParams<RequestsSearch>({ from: RequestsTableRoute.id });
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  // State for selected and total counts
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<Request[]>([]);

  // Update total and selected counts
  const updateCounts = (newSelected: Request[], newTotal: number | undefined) => {
    if (newTotal !== total) setTotal(newTotal);
    if (!arraysHaveSameElements(selected, newSelected)) setSelected(newSelected);
  };

  // Build columns
  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  //TODO implement accept and remove of request
  const openRemoveDialog = () => console.log('removed');
  const openInviteDialog = () => console.log('invited');

  const fetchExport = async (limit: number) => {
    const { items } = await getRequests({ q, sort, order, limit });
    return items;
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <RequestsTableHeaderBar
        total={total}
        selected={selected}
        columns={columns}
        setColumns={setColumns}
        q={q ?? ''}
        setSearch={setSearch}
        clearSelection={clearSelection}
        openRemoveDialog={openRemoveDialog}
        openInviteDialog={openInviteDialog}
        fetchExport={fetchExport}
      />
      <Suspense>
        <BaseDataTable
          columns={columns}
          queryVars={{ q, sort, order, limit }}
          updateCounts={updateCounts}
          sortColumns={sortColumns}
          setSortColumns={setSortColumns}
        />
      </Suspense>
    </div>
  );
};

export default RequestsTable;
