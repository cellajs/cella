import { useInfiniteQuery } from '@tanstack/react-query';
import { BirdIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Page } from '~/api.gen';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import type { CellRendererProps, RowsChangeData } from '~/modules/common/data-grid';
import { DataTable } from '~/modules/common/data-table';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { StickyBox } from '~/modules/common/sticky-box';
import { pagesLimit, pagesListQueryOptions, usePageUpdateMutation } from '~/modules/page/query';
import { DraggableCellRenderer } from '~/modules/page/table/draggable-cell-renderer';
import { PagesTableBar } from '~/modules/page/table/pages-bar';
import { usePagesTableColumns } from '~/modules/page/table/pages-columns';
import type { PagesRouteSearchParams } from '~/modules/page/types';

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
  const { q } = search;
  const limit = pagesLimit;

  // Build columns
  const [selected, setSelected] = useState<Page[]>([]);
  const { columns, visibleColumns, setColumns } = usePagesTableColumns(isCompact);

  const queryOptions = pagesListQueryOptions({ q, limit });

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
    select: ({ pages }) => {
      const items = pages.flatMap(({ items }) => items);
      // Sort by displayOrder for drag-and-drop reordering to work correctly
      return items.toSorted((a, b) => a.displayOrder - b.displayOrder);
    },
  });

  // Fetch more on scroll
  const fetchMore = async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  };

  // Page update mutation
  const updateMutation = usePageUpdateMutation();

  // Handle row changes for editable cells
  const onRowsChange = useCallback(
    (changedRows: Page[], { indexes, column }: RowsChangeData<Page>) => {
      if (column.key !== 'status' && column.key !== 'displayOrder') return;

      for (const index of indexes) {
        const page = changedRows[index];
        const originalPage = rows?.find((p) => p.id === page.id);

        if (!originalPage) continue;

        // Handle status changes
        if (column.key === 'status' && page.status !== originalPage.status) {
          updateMutation.mutate({
            id: page.id,
            key: 'status',
            data: page.status,
          });
        }
      }
    },
    [rows, updateMutation],
  );

  // Handle row selection
  const onSelectedRowsChange = (selectedIds: Set<string>) => {
    if (rows) {
      const selectedRows = rows.filter((row) => selectedIds.has(row.id));
      setSelected(selectedRows);
    }
  };

  const selectedRowIds = useMemo(() => new Set(selected.map((row) => row.id)), [selected]);

  const clearSelection = () => setSelected([]);

  // Custom renderCell that enables drag-and-drop row reordering
  const renderCell = useCallback(
    (key: React.Key, props: CellRendererProps<Page, unknown>) => {
      function onRowReorder(fromIndex: number, toIndex: number) {
        if (fromIndex === toIndex || !rows) return;

        const draggedPage = rows[fromIndex];
        const targetPage = rows[toIndex];

        if (!draggedPage || !targetPage) return;

        // Calculate new displayOrder using fractional ordering
        // This inserts between adjacent items without reordering all items
        let newOrder: number;

        if (fromIndex < toIndex) {
          // Dragging down - insert after target
          const nextPage = rows[toIndex + 1];
          newOrder = nextPage ? (targetPage.displayOrder + nextPage.displayOrder) / 2 : targetPage.displayOrder + 10;
        } else {
          // Dragging up - insert before target
          const prevPage = rows[toIndex - 1];
          newOrder = prevPage ? (prevPage.displayOrder + targetPage.displayOrder) / 2 : targetPage.displayOrder - 10;
        }

        // Only update if order changed
        if (newOrder !== draggedPage.displayOrder) {
          updateMutation.mutate({
            id: draggedPage.id,
            key: 'displayOrder',
            data: newOrder,
          });
        }
      }

      return <DraggableCellRenderer key={key} {...props} onRowReorder={onRowReorder} />;
    },
    [rows, updateMutation],
  );

  return (
    <FocusViewContainer data-is-compact={isCompact} className="container min-h-screen flex flex-col gap-4">
      <StickyBox className="z-10 bg-background" offsetTop={0} hideOnScrollDown>
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
      </StickyBox>
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
        onRowsChange={onRowsChange}
        renderCell={renderCell}
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
