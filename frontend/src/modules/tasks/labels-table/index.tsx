import { infiniteQueryOptions } from '@tanstack/react-query';
import { Bird, Trash, XSquare } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { type GetLabelsParams, deleteLabels, getLabels } from '~/api/labels';
import { useDebounce } from '~/hooks/use-debounce';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { useColumns } from '~/modules/tasks/labels-table/columns';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { useWorkspaceQuery } from '~/modules/workspaces/helpers/use-workspace';
import type { labelsSearchSchema } from '~/routes/workspaces';
import type { Label } from '~/types/app';

export const labelsQueryOptions = ({
  q,
  projectId,
  sort: initialSort,
  order: initialOrder,
  limit = 20,
  rowsLength = 0,
  orgIdOrSlug,
}: GetLabelsParams & {
  rowsLength?: number;
}) => {
  const sort = initialSort || 'lastUsedAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['labels', q, sort, order, projectId],
    initialPageParam: 0,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async ({ pageParam: page, signal }) =>
      await getLabels(
        {
          page,
          q,
          sort,
          order,
          projectId,
          limit: limit + Math.max(page * limit - rowsLength, 0),
          // If some items were added, offset should be undefined, otherwise it should be the length of the rows
          offset: rowsLength - page * limit > 0 ? undefined : rowsLength,
          orgIdOrSlug,
        },
        signal,
      ),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

type LabelsSearch = z.infer<typeof labelsSearchSchema>;

const LabelsTable = () => {
  const { t } = useTranslation();
  const [columns] = useColumns();
  const {
    data: { workspace, labels },
  } = useWorkspaceQuery();

  const [rows, setRows] = useState<Label[]>([]);
  const [query, setQuery] = useState<LabelsSearch['q']>('');
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [sortColumns, setSortColumns] = useState<SortColumn[]>([{ columnKey: 'lastUsedAt', direction: 'DESC' }]);

  // Search query options
  const q = useDebounce(query, 200);
  const sort = sortColumns[0]?.columnKey as LabelsSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as LabelsSearch['order'];

  // Total count
  const totalCount = labels.length;
  // Table selection
  const selectedLabels = useMemo(() => {
    return rows.filter((row) => selectedRows.has(row.id));
  }, [selectedRows, rows]);

  const onRowsChange = (changedRows: Label[]) => {
    setRows(changedRows);
  };

  const isFiltered = !!q;

  const onSearch = (searchString: string) => {
    if (selectedRows.size > 0) setSelectedRows(new Set<string>());
    setQuery(searchString);
  };

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
  };

  const removeLabel = () => {
    deleteLabels(
      selectedLabels.map((l) => l.id),
      workspace.organizationId,
    ).then(() => {
      toast.success(t('common:success.delete_resource', { resource: t(`app:${selectedRows.size > 1 ? 'labels' : 'label'}`) }));
      setSelectedRows(new Set<string>());
    });
  };

  useEffect(() => {
    const filteredLabels = q ? labels.filter((label) => label.name.toLowerCase().includes(q.toLowerCase())) : labels;
    const sortedLabels = filteredLabels.sort((a, b) => {
      if (sort === 'name') {
        return a.name.localeCompare(b.name) * (order === 'asc' ? 1 : -1);
      }
      if (sort === 'useCount') {
        return a.useCount - b.useCount * (order === 'asc' ? 1 : -1);
      }
      return new Date(a.lastUsedAt).getTime() - new Date(b.lastUsedAt).getTime() * (order === 'asc' ? 1 : -1);
    });
    setRows(sortedLabels);
  }, [labels, q, sort, order]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className={'flex pt-2 w-full max-sm:justify-between gap-2'}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions className="w-full">
            {selectedLabels.length > 0 && (
              <div className="inline-flex align-center items-center gap-2">
                <TooltipButton toolTipContent={t('app:remove_task')}>
                  <Button variant="destructive" className="relative" onClick={removeLabel}>
                    <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5">{selectedLabels.length}</Badge>
                    <Trash size={16} />
                    <span className="ml-1 max-xs:hidden">{t('common:remove')}</span>
                  </Button>
                </TooltipButton>
                <TooltipButton toolTipContent={t('common:clear_selection')}>
                  <Button variant="ghost" className="relative" onClick={() => setSelectedRows(new Set<string>())}>
                    <XSquare size={16} />
                    <span className="ml-1 max-xs:hidden">{t('common:clear')}</span>
                  </Button>
                </TooltipButton>
              </div>
            )}
            <TableCount count={totalCount} type="label" isFiltered={isFiltered} onResetFilters={onResetFilters} />
          </FilterBarActions>
          <FilterBarContent className="w-full">
            <TableSearch value={query || ''} setQuery={onSearch} />
          </FilterBarContent>
        </TableFilterBar>
      </div>
      <DataTable<Label>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          rowHeight: 42,
          rowKeyGetter: (row) => row.id,
          enableVirtualization: false,
          overflowNoRows: true,
          limit: 20,
          isFiltered,
          selectedRows: selectedRows,
          onRowsChange,
          onSelectedRowsChange: setSelectedRows,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('app:labels').toLowerCase() })} />,
        }}
      />
    </div>
  );
};

export default LabelsTable;
