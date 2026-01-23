import { useInfiniteQuery } from '@tanstack/react-query';
import { BirdIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Page } from '~/api.gen';
import useSearchParams from '~/hooks/use-search-params';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { pagesLimit, pagesQueryOptions } from '~/modules/pages/query';
import type { PagesRouteSearchParams } from '~/modules/pages/types';
import { PagesTableBar } from './pages-bar';
import { usePagesTableColumns } from './pages-columns';

/** Stable row key getter function - defined outside component to prevent re-renders */
function rowKeyGetter(row: Page) {
  return row.id;
}

/**
 * Pages table component for listing pages in a data table.
 */
function PagesTable() {
  const { t } = useTranslation();
  const [isCompact, setIsCompact] = useState(false);

  const { search, setSearch } = useSearchParams<PagesRouteSearchParams>();

  // Table state
  const { q, sort, order } = search;
  const limit = pagesLimit;

  // Build columns
  const [selected, setSelected] = useState<Page[]>([]);
  const { columns, visibleColumns, setColumns } = usePagesTableColumns(isCompact);
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const queryOptions = pagesQueryOptions({ q, sort, order, limit });

  // Infinite query for paginated data
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

  // Fetch more on scroll
  const fetchMore = useCallback(async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  }, [hasNextPage, isLoading, isFetching, fetchNextPage]);

  // Handle row selection
  const onSelectedRowsChange = useCallback(
    (selectedIds: Set<string>) => {
      if (rows) {
        const selectedRows = rows.filter((row) => selectedIds.has(row.id));
        setSelected(selectedRows);
      }
    },
    [rows],
  );

  // Memoize the Set of selected row IDs to prevent unnecessary re-renders
  const selectedRowIds = useMemo(() => new Set(selected.map((row) => row.id)), [selected]);

  const clearSelection = () => setSelected([]);

  return (
    <FocusViewContainer data-is-compact={isCompact} className="container min-h-screen flex flex-col gap-4">
      <PagesTableBar
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
        selected={selected}
        clearSelection={clearSelection}
        isCompact={isCompact}
        setIsCompact={setIsCompact}
        total={rows?.length ?? 0}
      />
      <DataTable
        rows={rows}
        rowHeight={52}
        rowKeyGetter={rowKeyGetter}
        columns={visibleColumns}
        enableVirtualization={true}
        limit={limit}
        error={error}
        isLoading={isLoading}
        isFetching={isFetching}
        isFiltered={!!q}
        hasNextPage={hasNextPage}
        fetchMore={fetchMore}
        selectedRows={selectedRowIds}
        onSelectedRowsChange={onSelectedRowsChange}
        sortColumns={sortColumns}
        onSortColumnsChange={setSortColumns}
        NoRowsComponent={
          <ContentPlaceholder
            icon={BirdIcon}
            title="common:no_resource_yet"
            titleProps={{ resource: t('common:pages').toLowerCase() }}
          />
        }
      />
    </FocusViewContainer>
  );
}

export default PagesTable;
