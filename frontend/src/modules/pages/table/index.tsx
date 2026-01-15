import { ilike, isNull, not, or, useLiveQuery } from '@tanstack/react-db';
import { useLoaderData } from '@tanstack/react-router';
import { BirdIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Page } from '~/api.gen';
import useSearchParams from '~/hooks/use-search-params';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { pagesLimit } from '~/modules/pages/query';
import type { PagesRouteSearchParams } from '~/modules/pages/types';
import { DocsPagesRoute } from '~/routes/docs-routes';
import { PagesTableBar } from './pages-bar';
import { usePagesTableColumns } from './pages-columns';

/**
 * Pages table component for listing pages in a data table.
 */
const PagesTable = () => {
  const { t } = useTranslation();
  const [isCompact, setIsCompact] = useState(false);

  const { pagesCollection } = useLoaderData({ from: DocsPagesRoute.id });
  const { search, setSearch } = useSearchParams<PagesRouteSearchParams>();

  // Table state
  const { q, sort, order } = search;
  const limit = pagesLimit;

  // Build columns
  const [selected, setSelected] = useState<Page[]>([]);
  const { columns, visibleColumns, setColumns } = usePagesTableColumns(isCompact);
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  // Live query for reactive data from Electric collection
  const {
    data: rows,
    isLoading,
    isError,
  } = useLiveQuery(
    (liveQuery) => {
      return liveQuery
        .from({ page: pagesCollection })
        .where(({ page }) =>
          q ? or(ilike(page.name, `%${q.trim()}%`), ilike(page.description, `%${q.trim()}%`)) : not(isNull(page.id)),
        )
        .orderBy(({ page }) => page[sort || 'createdAt'], order || 'desc');
    },
    [q, sort, order],
  );

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

  const clearSelection = () => setSelected([]);

  const error = isError ? new Error(t('common:failed_to_load_pages')) : undefined;

  return (
    <div data-is-compact={isCompact} className="flex flex-col gap-4 h-full">
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
        pagesCollection={pagesCollection}
      />
      <DataTable
        rows={rows}
        rowHeight={52}
        rowKeyGetter={(r) => r.id}
        columns={visibleColumns}
        enableVirtualization={true}
        limit={limit}
        error={error}
        isLoading={isLoading}
        isFiltered={!!q}
        hasNextPage={false}
        selectedRows={new Set(selected.map((row) => row.id))}
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
    </div>
  );
};

export default PagesTable;
