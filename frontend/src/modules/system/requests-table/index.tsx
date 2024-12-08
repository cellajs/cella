import { useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import type { z } from 'zod';
import { getRequests } from '~/api/requests';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';
import { useColumns } from '~/modules/system/requests-table/columns';
import { RequestsTableHeaderBar } from '~/modules/system/requests-table/table-header';
import { RequestsTableRoute } from '~/routes/system';
import type { BaseTableMethods, Request } from '~/types/common';
import { arraysHaveSameElements } from '~/utils';
import type { getRequestsQuerySchema } from '#/modules/requests/schema';

const BaseRequestsTable = lazy(() => import('~/modules/system/requests-table/table'));
const LIMIT = config.requestLimits.requests;

export type RequestsSearch = z.infer<typeof getRequestsQuerySchema>;

const RequestsTable = () => {
  const search = useSearch({ from: RequestsTableRoute.id });
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const [q, setQuery] = useState<RequestsSearch['q']>(search.q);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // State for selected and total counts
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Request[]>([]);

  // Update total and selected counts
  const updateCounts = (newSelected: Request[], newTotal: number) => {
    if (newTotal !== total) setTotal(newTotal);
    if (!arraysHaveSameElements(selected, newSelected)) setSelected(newSelected);
  };

  // Search query options
  const sort = sortColumns[0]?.columnKey as RequestsSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as RequestsSearch['order'];
  const limit = LIMIT;

  // Save filters in search params
  const filters = useMemo(() => ({ q, sort, order }), [q, sortColumns]);
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  // Build columns
  const [columns, setColumns] = useColumns();

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
        setQuery={setQuery}
        clearSelection={clearSelection}
        openRemoveDialog={openRemoveDialog}
        openInviteDialog={openInviteDialog}
        fetchExport={fetchExport}
      />
      <Suspense>
        <BaseRequestsTable
          columns={columns}
          sortColumns={sortColumns}
          setSortColumns={setSortColumns}
          queryVars={{
            q,
            sort,
            order,
            limit,
          }}
          updateCounts={updateCounts}
        />
      </Suspense>
    </div>
  );
};

export default RequestsTable;
