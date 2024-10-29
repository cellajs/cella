import { infiniteQueryOptions, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import { Handshake, Trash, XSquare } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import useMapQueryDataToRows from '~/hooks/use-map-query-data-to-rows';
import { DataTable } from '~/modules/common/data-table';
import ColumnsView from '~/modules/common/data-table/columns-view';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { FocusView } from '~/modules/common/focus-view';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

import { config } from 'config';
import { Bird } from 'lucide-react';
import { type GetRequestsParams, getRequests } from '~/api/requests';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { RequestsTableRoute } from '~/routes/system';
import type { Request } from '~/types/common';

import useSearchParams from '~/hooks/use-search-params';
import Export from '~/modules/common/data-table/export';
import { useColumns } from '~/modules/system/requests-table/columns';

export const requestsQueryOptions = ({
  q,
  sort: initialSort,
  order: initialOrder,
  limit = LIMIT,
  rowsLength = 0,
}: GetRequestsParams & {
  rowsLength?: number;
}) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['requests', q, sort, order],
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) =>
      await getRequests(
        {
          page,
          q,
          sort,
          order,
          // Fetch more items than the limit if some items were deleted
          limit: limit + Math.max(page * limit - rowsLength, 0),
          // If some items were added, offset should be undefined, otherwise it should be the length of the rows
          offset: rowsLength - page * limit > 0 ? undefined : rowsLength,
        },
        signal,
      ),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

const LIMIT = 40;

const RequestsTable = () => {
  const search = useSearch({ from: RequestsTableRoute.id });
  const { t } = useTranslation();

  const {
    search: { q, order, sort },
    setSearch,
  } = useSearchParams<'sort' | 'order' | 'q'>(RequestsTableRoute.id, { sort: 'createdAt', order: 'desc' });

  const [rows, setRows] = useState<Request[]>([]);

  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Search query options
  const limit = LIMIT;

  // Check if there are active filters
  const isFiltered = !!q;

  // Query organizations
  const queryResult = useSuspenseInfiniteQuery(requestsQueryOptions({ q, sort, order, limit, rowsLength: rows.length }));

  // Total count
  const totalCount = queryResult.data?.pages[0].total;

  const onSearch = (searchString: string) => {
    if (selectedRows.size > 0) setSelectedRows(new Set<string>());
    setSearch({ q: searchString });
  };

  // Table selection
  const selectedRequests = useMemo(() => {
    return rows.filter((row) => selectedRows.has(row.id));
  }, [selectedRows, rows]);

  // Build columns
  const [columns, setColumns] = useColumns();

  // Map (updated) query data to rows
  useMapQueryDataToRows<Request>({ queryResult, setRows });

  const onRowsChange = async (changedRows: Request[]) => {
    setRows(changedRows);
  };

  // Reset filters
  const onResetFilters = () => {
    setSearch({ q: '' });
    setSelectedRows(new Set<string>());
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
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
            {selectedRequests.length === 0 && <TableCount count={totalCount} type="member" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent>
            <TableSearch value={q} setQuery={onSearch} />
          </FilterBarContent>
        </TableFilterBar>
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
        <Export
          className="max-lg:hidden"
          filename={`${config.slug}-requests`}
          columns={columns}
          fetchRows={async (limit) => {
            const { items } = await getRequests({ limit, q, sort, order });
            return items;
          }}
        />
        <FocusView iconOnly />
      </div>
      <DataTable<Request>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount,
          rowHeight: 42,
          rowKeyGetter: (row) => row.id,
          error: queryResult.error,
          isLoading: queryResult.isLoading,
          isFetching: queryResult.isFetching,
          enableVirtualization: false,
          isFiltered,
          limit,
          onRowsChange,
          fetchMore: queryResult.fetchNextPage,
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
