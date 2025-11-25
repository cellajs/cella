import { BirdIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '~/api.gen';
import useOfflineTableSearch from '~/hooks/use-offline-table-search';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { usePagesList } from '~/modules/pages/hooks';
import { filterPages } from '~/modules/pages/queries';
import { PagesTableBar } from './table-bar';
import { usePagesTableColumns } from './use-columns';

const PagesTable = () => {
  const { t } = useTranslation();
  const [isCompact, setIsCompact] = useState(false);

  // const { user } = useUserStore();

  const { search, setSearch, data, isLoading, isFetching, error, hasNextPage, fetchNextPage } = usePagesList();

  const rows = useOfflineTableSearch({
    data,
    filterFn: filterPages,
  });

  const { columns, visibleColumns, setColumns } = usePagesTableColumns(isCompact);

  const { sortColumns, setSortColumns } = useSortColumns(search.sort, search.order, setSearch);

  const [selected, setSelected] = useState<Page[]>([]);

  return (
    <div data-is-compact={isCompact} className="flex flex-col gap-4 h-full">
      <PagesTableBar
        queryKey={['pages', 'table']}
        searchVars={search}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
        selected={selected}
        clearSelection={() => setSelected([])}
        isCompact={isCompact}
        setIsCompact={setIsCompact}
      />
      <DataTable
        rows={rows}
        rowHeight={52}
        onRowsChange={async (_changedRows, { column, indexes }) => {
          if (column.key !== 'role') return;
          console.log(indexes);
          // if (!onlineManager.isOnline()) {
          //   toaster(t('common:action.offline.text'), 'warning');
          //   return;
          // }

          // in orgs, this is membership update or w/e - side effects
        }}
        rowKeyGetter={(r) => r.id}
        columns={visibleColumns}
        enableVirtualization={true}
        limit={search.limit}
        error={error}
        isLoading={isLoading}
        isFetching={isFetching}
        isFiltered={!!search.q}
        hasNextPage={hasNextPage}
        fetchMore={fetchNextPage}
        selectedRows={new Set(selected.map((row) => row.id))}
        onSelectedRowsChange={(_selectedIds) => {
          // if (rows) {
          //   const selectedRows = rows.filter((row) => selectedIds.has(row.id));
          //   setSelected(selectedRows);
          // }
        }}
        sortColumns={sortColumns}
        onSortColumnsChange={setSortColumns}
        NoRowsComponent={
          <ContentPlaceholder icon={BirdIcon} title="common:no_resource_yet" titleProps={{ resource: t('common:pages').toLowerCase() }} />
        }
      />
    </div>
  );
};

export default PagesTable;
