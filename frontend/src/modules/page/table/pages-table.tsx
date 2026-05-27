import { useInfiniteQuery } from '@tanstack/react-query';
import { BirdIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Page } from 'sdk';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import type { RowsChangeData } from '~/modules/common/data-grid';
import { DataTable } from '~/modules/common/data-table/data-table';
import { TreeProvider, useTreeRows } from '~/modules/common/data-table/tree';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { pagesLimit, pagesListQueryOptions, usePageUpdateMutation } from '~/modules/page/query';
import { PageRowPreview } from '~/modules/page/table/page-row-preview';
import { MAX_PAGE_DEPTH, PAGES_ROW_HEIGHT, type PageTreeRow } from '~/modules/page/table/page-tree-config';
import { PagesTableBar } from '~/modules/page/table/pages-bar';
import { usePagesTableColumns } from '~/modules/page/table/pages-columns';
import type { PagesRouteSearchParams } from '~/modules/page/types';

/** Stable row key getter — defined outside the component to keep its identity stable. */
function rowKeyGetter(row: PageTreeRow) {
  return row.id;
}

/** Stable drag preview renderer — defined at module scope so DataGrid's prop identity stays stable. */
function renderRowDragPreview(row: PageTreeRow) {
  return <PageRowPreview page={row} />;
}

/**
 * Whether the pages tree starts fully expanded. Set to `true` so the docs
 * hierarchy is visible at a glance; the user can collapse subtrees individually.
 */
const DEFAULT_EXPANDED = true;

/**
 * Pages table component for listing pages in a data table.
 */
function PagesTable() {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<PagesRouteSearchParams>();

  // Table state
  const { q } = search;
  const limit = pagesLimit;

  // Build columns. The tree expand toggle reads its handler / row height /
  // max depth from the surrounding `<TreeProvider>`, so no per-cell wiring
  // is needed here.
  const [selected, setSelected] = useState<PageTreeRow[]>([]);
  const { columns, visibleColumns, setColumns } = usePagesTableColumns();

  const queryOptions = pagesListQueryOptions({ q, limit });

  // Page update mutation. The object returned from `useMutation` is fresh on
  // every render, so we keep it behind a latest-ref. That keeps the row
  // callbacks (and the `mutate` passed into `useTreeRows`) stable without
  // writing `useCallback` everywhere.
  const updateMutation = usePageUpdateMutation();
  const updateMutationRef = useLatestRef(updateMutation);

  // Owns expansion state and provides reorder/reparent/canDrop handlers
  // bound to a generic displayOrder/parentId mutation. Reads default field
  // names off the `Page` shape (`id`, `parentId`, `displayOrder`).
  const tree = useTreeRows<Page>({
    defaultExpanded: DEFAULT_EXPANDED,
    rowHeight: PAGES_ROW_HEIGHT,
    maxDepth: MAX_PAGE_DEPTH,
    mutate: useCallback((id, ops) => updateMutationRef.current.mutate({ id, ops }), [updateMutationRef]),
  });

  const buildRows = tree.buildRows;
  const select = useCallback(
    ({ pages }: { pages: { items: Page[] }[] }) => buildRows(pages.flatMap(({ items }) => items)),
    [buildRows],
  );

  const {
    data: rows,
    isLoading,
    isFetching,
    error,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({ ...queryOptions, select });

  const fetchMore = async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  };

  // Stable ref to the latest rows so the row callbacks below don't need
  // `rows` in their deps.
  const rowsRef = useLatestRef(rows);

  const onRowsChange = (changedRows: PageTreeRow[], { indexes, column }: RowsChangeData<PageTreeRow>) => {
    if (column.key !== 'status' && column.key !== 'renderMode' && column.key !== 'displayOrder') return;

    const currentRows = rowsRef.current;
    const mutation = updateMutationRef.current;
    for (const index of indexes) {
      const page = changedRows[index];
      const originalPage = currentRows?.find((p) => p.id === page.id);
      if (!originalPage) continue;

      if (column.key === 'status' && page.status !== originalPage.status) {
        mutation.mutate({ id: page.id, ops: { status: page.status } });
      }
      if (column.key === 'renderMode' && page.renderMode !== originalPage.renderMode) {
        mutation.mutate({ id: page.id, ops: { renderMode: page.renderMode } });
      }
    }
  };

  const onSelectedRowsChange = (selectedIds: Set<string>) => {
    const currentRows = rowsRef.current;
    if (!currentRows) return;
    setSelected(currentRows.filter((row) => selectedIds.has(row.id)));
  };

  const selectedRowIds = useMemo(() => new Set(selected.map((row) => row.id)), [selected]);

  const clearSelection = () => setSelected([]);

  return (
    <FocusViewContainer>
      <PagesTableBar
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
        selected={selected}
        clearSelection={clearSelection}
        queryKey={queryOptions.queryKey}
      />
      <TreeProvider value={tree.context}>
        <DataTable
          rows={rows}
          rowHeight={tree.rowHeight}
          rowKeyGetter={rowKeyGetter}
          columns={visibleColumns}
          enableVirtualization={true}
          enableDragAutoScroll={true}
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
          onRowReorder={(fromIdx, toIdx, edge) => tree.onReorder(rowsRef.current, fromIdx, toIdx, edge)}
          onRowReparent={(fromIdx, toIdx) => tree.onReparent(rowsRef.current, fromIdx, toIdx)}
          canDropRow={(args) => tree.canDrop(rowsRef.current, args)}
          renderRowDragPreview={renderRowDragPreview}
          NoRowsComponent={
            <ContentPlaceholder
              icon={BirdIcon}
              title="c:no_resource_yet"
              titleProps={{ resource: t('c:pages').toLowerCase() }}
            />
          }
        />
      </TreeProvider>
    </FocusViewContainer>
  );
}

export default PagesTable;
