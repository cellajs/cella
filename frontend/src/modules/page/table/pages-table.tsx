import { BirdIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import type { RowsChangeData } from '~/modules/common/data-grid/types';
import { DataTable } from '~/modules/common/data-table/data-table';
import { TreeProvider } from '~/modules/common/data-table/tree/tree-context';
import { useTreeRows } from '~/modules/common/data-table/tree/use-tree-rows';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { type DocPage, docPages } from '~/modules/page/content';
import { PageRowPreview } from '~/modules/page/table/page-row-preview';
import { maxPageDepth, type PageTreeRow, pagesRowHeight } from '~/modules/page/table/page-tree';
import { PagesTableBar } from '~/modules/page/table/pages-bar';
import { useColumns } from '~/modules/page/table/pages-columns';
import type { PagesRouteSearchParams } from '~/modules/page/types';
import { canEditDocs, type DocEditOps, editDocPage } from '~/modules/page/utils/edit-doc-page';

// Module scope keeps these prop identities stable, which DataGrid's memoized rows depend on.
function rowKeyGetter(row: PageTreeRow) {
  return row.id;
}

function renderRowDragPreview(row: PageTreeRow) {
  return <PageRowPreview page={row} />;
}

/** Renders the build-time MDX index; development edits persist to frontmatter, and bundled production content is read-only. */
export function PagesTable() {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<PagesRouteSearchParams>();

  const { q } = search;

  const [columns, setColumns] = useColumns();

  const [pages, setPages] = useState<DocPage[]>(docPages);

  // Optimistic update; a failed write reverts to the on-disk snapshot (`docPages`) and `editDocPage` raises the toast.
  const applyEdit = (id: string, patch: Partial<DocPage>, ops: DocEditOps) => {
    setPages((prev) => prev.map((page) => (page.id === id ? { ...page, ...patch } : page)));
    editDocPage(id, ops).catch(() => setPages(docPages));
  };

  // A `parentId` change moves files on disk (vite/docs-editor.ts); `displayOrder` rewrites the `order` frontmatter field.
  const treeMutate = (id: string, ops: { displayOrder?: number; parentId?: string | null }) => {
    const patch: Partial<DocPage> = {};
    if (ops.displayOrder !== undefined) patch.displayOrder = ops.displayOrder;
    if (ops.parentId !== undefined) patch.parentId = ops.parentId;
    applyEdit(id, patch, ops);
  };

  const tree = useTreeRows<DocPage>({ defaultExpanded: true, rowHeight: pagesRowHeight, maxDepth: maxPageDepth, mutate: treeMutate });

  const query = q?.trim().toLowerCase();
  const filtered = query
    ? pages.filter((page) => [page.name, page.description, page.keywords, page.id].some((value) => value?.toLowerCase().includes(query)))
    : pages;
  // `rows` omits collapsed descendants, so the header count uses `filtered.length` to stay the true total.
  const rows = tree.buildRows(filtered);

  const onRowsChange = (changedRows: PageTreeRow[], { indexes, column }: RowsChangeData<PageTreeRow>) => {
    if (column.key !== 'name' && column.key !== 'renderMode' && column.key !== 'status') return;
    for (const index of indexes) {
      const row = changedRows[index];
      const original = pages.find((page) => page.id === row.id);
      if (!original) continue;

      if (column.key === 'name' && row.name !== original.name) {
        applyEdit(row.id, { name: row.name }, { title: row.name });
      }
      if (column.key === 'renderMode' && row.renderMode !== original.renderMode) {
        applyEdit(row.id, { renderMode: row.renderMode }, { renderMode: row.renderMode });
      }
      if (column.key === 'status' && row.draft !== original.draft) {
        applyEdit(row.id, { draft: row.draft }, { draft: row.draft });
      }
    }
  };

  return (
    <FocusViewContainer>
      <PagesTableBar total={filtered.length} searchVars={search} setSearch={setSearch} columns={columns} setColumns={setColumns} />
      <TreeProvider value={tree.context}>
        <DataTable
          rows={rows}
          rowHeight={tree.rowHeight}
          rowKeyGetter={rowKeyGetter}
          columns={columns}
          enableVirtualization
          isFiltered={!!q}
          hasNextPage={false}
          {...(canEditDocs && {
            enableDragAutoScroll: true,
            onRowsChange,
            onRowReorder: (fromIdx: number, toIdx: number, edge: 'top' | 'bottom') => tree.onReorder(rows, fromIdx, toIdx, edge),
            onRowReparent: (fromIdx: number, toIdx: number) => tree.onReparent(rows, fromIdx, toIdx),
            canDropRow: (args: { fromIdx: number; toIdx: number; zone: 'top' | 'bottom' | 'center' }) => tree.canDrop(rows, args),
            renderRowDragPreview,
          })}
          NoRowsComponent={
            <ContentPlaceholder icon={BirdIcon} title="c:no_resource_yet" titleOptions={{ resource: t('c:page_other').toLowerCase() }} />
          }
        />
      </TreeProvider>
    </FocusViewContainer>
  );
}
