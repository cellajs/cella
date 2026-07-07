import { BirdIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table/data-table';
import { TreeProvider, useTreeRows } from '~/modules/common/data-table/tree';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { type DocPage, docPages } from '~/modules/page/content';
import { MAX_PAGE_DEPTH, PAGES_ROW_HEIGHT, type PageTreeRow } from '~/modules/page/table/page-tree-config';
import { PagesTableBar } from '~/modules/page/table/pages-bar';
import { usePagesTableColumns } from '~/modules/page/table/pages-columns';
import type { PagesRouteSearchParams } from '~/modules/page/types';

/** Stable row key getter — defined outside the component to keep its identity stable. */
function rowKeyGetter(row: PageTreeRow) {
  return row.id;
}

/** Content is file-based and read-only in the UI; the tree never mutates. */
const noopMutate = () => {};

/**
 * Whether the pages tree starts fully expanded. Set to `true` so the docs
 * hierarchy is visible at a glance; the user can collapse subtrees individually.
 */
const DEFAULT_EXPANDED = true;

/**
 * Read-only index of the MDX docs content (`src/content/docs`). Rows come from
 * the build-time content collection; editing happens in the content files.
 */
function PagesTable() {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<PagesRouteSearchParams>();

  const { q } = search;

  const { columns, setColumns } = usePagesTableColumns();

  // Owns expansion state for the tree; mutation handlers are inert (read-only).
  const tree = useTreeRows<DocPage>({
    defaultExpanded: DEFAULT_EXPANDED,
    rowHeight: PAGES_ROW_HEIGHT,
    maxDepth: MAX_PAGE_DEPTH,
    mutate: noopMutate,
  });

  const buildRows = tree.buildRows;
  const rows = useMemo(() => {
    const query = q?.trim().toLowerCase();
    const filtered = query
      ? docPages.filter((page) =>
          [page.name, page.description, page.keywords, page.id].some((value) => value?.toLowerCase().includes(query)),
        )
      : docPages;
    return buildRows(filtered);
  }, [q, buildRows]);

  return (
    <FocusViewContainer>
      <PagesTableBar
        total={rows.length}
        searchVars={search}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
      />
      <TreeProvider value={tree.context}>
        <DataTable
          rows={rows}
          rowHeight={tree.rowHeight}
          rowKeyGetter={rowKeyGetter}
          columns={columns}
          enableVirtualization={true}
          isFiltered={!!q}
          hasNextPage={false}
          NoRowsComponent={
            <ContentPlaceholder
              icon={BirdIcon}
              title="c:no_resource_yet"
              titleProps={{ resource: t('c:page_other').toLowerCase() }}
            />
          }
        />
      </TreeProvider>
    </FocusViewContainer>
  );
}

export { PagesTable };
