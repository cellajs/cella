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
import type { BaseTableMethods } from '~/types/common';
import type { getRequestsQuerySchema } from '#/modules/requests/schema';

const BaseRequestsTable = lazy(() => import('~/modules/system/requests-table/table'));
const LIMIT = config.requestLimits.requests;

export type RequestsSearch = z.infer<typeof getRequestsQuerySchema>;
export type RequestsTableMethods = BaseTableMethods & {
  openInviteDialog: () => void;
};

const RequestsTable = () => {
  const search = useSearch({ from: RequestsTableRoute.id });

  // Table state
  const [q, setQuery] = useState<RequestsSearch['q']>(search.q);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Search query options
  const sort = sortColumns[0]?.columnKey as RequestsSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as RequestsSearch['order'];
  const limit = LIMIT;

  // Save filters in search params
  const filters = useMemo(() => ({ q, sort, order }), [q, sortColumns]);
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  // Build columns
  const [columns, setColumns] = useColumns();

  const tableId = 'requests-table';
  const dataTableRef = useRef<RequestsTableMethods | null>(null);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  const openRemoveDialog = () => {
    if (dataTableRef.current) dataTableRef.current.openRemoveDialog();
  };

  const openInviteDialog = () => {
    if (dataTableRef.current) dataTableRef.current.openInviteDialog();
  };

  const fetchExport = async (limit: number) => {
    const { items } = await getRequests({ q, sort, order, limit });
    return items;
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <RequestsTableHeaderBar
        tableId={tableId}
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
          tableId={tableId}
          columns={columns}
          sortColumns={sortColumns}
          setSortColumns={setSortColumns}
          queryVars={{
            q,
            sort,
            order,
            limit,
          }}
        />
      </Suspense>
    </div>
  );
};

export default RequestsTable;
