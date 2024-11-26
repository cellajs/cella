import { infiniteQueryOptions } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import { Handshake, Trash, XSquare } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { useDataFromSuspenseInfiniteQuery } from '~/hooks/use-data-from-query';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { DataTable } from '~/modules/common/data-table';
import ColumnsView from '~/modules/common/data-table/columns-view';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { FocusView } from '~/modules/common/focus-view';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

import type { getRequestsQuerySchema } from 'backend/modules/requests/schema';
import { config } from 'config';
import { Bird } from 'lucide-react';
import { type GetRequestsParams, getRequests } from '~/api/requests';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { RequestsTableRoute } from '~/routes/system';
import type { Request } from '~/types/common';

import Export from '~/modules/common/data-table/export';
import { useColumns } from '~/modules/system/requests-table/columns';
import { getPaginatedOffset } from '~/utils/mutate-query';
type RequestsSearch = z.infer<typeof getRequestsQuerySchema>;

const LIMIT = config.requestLimits.requests;

export const requestsQueryOptions = ({ q = '', sort: initialSort, order: initialOrder, limit = LIMIT }: GetRequestsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = ['requests', 'list', q, sort, order];
  const offset = getPaginatedOffset(queryKey);

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getRequests({ page, q, sort, order, limit, offset }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

const RequestsTable = () => {
  const search = useSearch({ from: RequestsTableRoute.id });
  const { t } = useTranslation();

  // Table state
  const [q, setQuery] = useState<RequestsSearch['q']>(search.q);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Search query options
  const sort = sortColumns[0]?.columnKey as RequestsSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as RequestsSearch['order'];
  const limit = LIMIT;

  const isFiltered = !!q;

  // Query requests
  const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } = useDataFromSuspenseInfiniteQuery(
    requestsQueryOptions({ q, sort, order, limit }),
  );

  const onSearch = (searchString: string) => {
    if (selectedRows.size > 0) setSelectedRows(new Set<string>());
    setQuery(searchString);
  };

  // Table selection
  const selectedRequests = useMemo(() => {
    return rows.filter((row) => selectedRows.has(row.id));
  }, [selectedRows, rows]);

  // Build columns
  const [columns, setColumns] = useColumns();

  // Save filters in search params
  const filters = useMemo(() => ({ q, sort, order }), [q, sortColumns]);
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  const onRowsChange = async (changedRows: Request[]) => {
    setRows(changedRows);
  };

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
        {/* Filter bar */}
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selectedRequests.length > 0 && (
              <>
                <div className="relative inline-flex items-center gap-2">
                  <Badge className="px-1 py-0 min-w-5 flex justify-center  animate-in zoom-in">{selectedRequests.length}</Badge>
                  <Button asChild variant="success" onClick={() => console.log('invited')}>
                    <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="req-filter-bar-button-invite">
                      <motion.span layoutId="req-filter-bar-icon-successes">
                        <Handshake size={16} />
                      </motion.span>
                      <span className="ml-1 max-xs:hidden">{t('common:accept')}</span>
                    </motion.button>
                  </Button>

                  <Button asChild variant="destructive" onClick={() => console.log('declined')}>
                    <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="req-filter-bar-button-delete">
                      <motion.span layoutId="req-filter-bar-icon-delete">
                        <Trash size={16} />
                      </motion.span>
                      <span className="ml-1 max-xs:hidden">{t('common:delete')}</span>
                    </motion.button>
                  </Button>
                </div>
                <Button asChild variant="ghost" onClick={() => setSelectedRows(new Set<string>())}>
                  <motion.button
                    transition={{
                      bounce: 0,
                      duration: 0.2,
                    }}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                  >
                    <XSquare size={16} />
                    <span className="ml-1">{t('common:clear')}</span>{' '}
                  </motion.button>
                </Button>
              </>
            )}
            {!isLoading && selectedRequests.length === 0 && (
              <TableCount count={totalCount} type="request" isFiltered={isFiltered} onResetFilters={onResetFilters} />
            )}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent>
            <TableSearch value={q} setQuery={onSearch} />
          </FilterBarContent>
        </TableFilterBar>

        {/* Columns view */}
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

        {/* Export */}
        <Export
          className="max-lg:hidden"
          filename={`${config.slug}-requests`}
          columns={columns}
          fetchRows={async (limit) => {
            const { items } = await getRequests({ limit, q, sort, order });
            return items;
          }}
        />

        {/* Focus view */}
        <FocusView iconOnly />
      </div>

      {/* Table */}
      <DataTable<Request>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount,
          rowHeight: 42,
          rowKeyGetter: (row) => row.id,
          error,
          isLoading,
          isFetching,
          enableVirtualization: false,
          isFiltered,
          limit,
          onRowsChange,
          fetchMore: fetchNextPage,
          sortColumns,
          selectedRows,
          onSelectedRowsChange: setSelectedRows,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:requests').toLowerCase() })} />,
        }}
      />
    </div>
  );
};

export default RequestsTable;
