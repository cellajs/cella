import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import type { getProjectsQuerySchema } from 'backend/modules/projects/schema';
import { Bird } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { type GetProjectsParams, getProjects } from '~/api/projects';
import { useDebounce } from '~/hooks/use-debounce';
import useMapQueryDataToRows from '~/hooks/use-map-query-data-to-rows';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import type { Project } from '~/types';
import { useColumns } from './columns';

import { Trash, XSquare } from 'lucide-react';
import ColumnsView from '~/modules/common/data-table/columns-view';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { dialog } from '~/modules/common/dialoger/state';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import DeleteProjects from '../delete-projects';
import { toast } from 'sonner';
import { useMutateInfiniteQueryData } from '~/hooks/use-mutate-query-data';

export type ProjectsSearch = z.infer<typeof getProjectsQuerySchema>;

export const projectsQueryOptions = ({
  q,
  sort: initialSort,
  order: initialOrder,
  limit = LIMIT,
  requestedUserId,
  rowsLength = 0,
}: GetProjectsParams & {
  rowsLength?: number;
}) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['projects', requestedUserId, q, sort, order],
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) =>
      await getProjects(
        {
          page,
          q,
          sort,
          order,
          // Fetch more items than the limit if some items were deleted
          limit: limit + Math.max(page * limit - rowsLength, 0),
          // If some items were added, offset should be undefined, otherwise it should be the length of the rows
          offset: rowsLength - page * limit > 0 ? undefined : rowsLength,
          requestedUserId,
        },
        signal,
      ),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

const LIMIT = 40;

export default function ProjectsTable({ userId }: { userId?: string }) {
  const { t } = useTranslation();

  const [rows, setRows] = useState<Project[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [columns, setColumns] = useColumns();
  const [query, setQuery] = useState<GetProjectsParams['q']>('');
  const [sortColumns, setSortColumns] = useState<SortColumn[]>([{ columnKey: 'createdAt', direction: 'DESC' }]);

  // Search query options
  const q = useDebounce(query, 200);
  const sort = sortColumns[0]?.columnKey as ProjectsSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as ProjectsSearch['order'];
  const limit = LIMIT;
  const requestedUserId = userId;

  // Drop selected Rows on search
  const onSearch = (searchString: string) => {
    setSelectedRows(new Set<string>());
    setQuery(searchString);
  };

  // Query projects
  const queryResult = useInfiniteQuery(projectsQueryOptions({ q, sort, order, limit, requestedUserId, rowsLength: rows.length }));

  // Total count
  const totalCount = queryResult.data?.pages[0].total;

  const isFiltered = !!q;

  const callback = useMutateInfiniteQueryData(['projects', q, sort, order], (item) => ['projects', item.id]);

  useMapQueryDataToRows<Project>({ queryResult, setSelectedRows, setRows, selectedRows });

  const onRowsChange = (changedRows: Project[]) => {
    setRows(changedRows);
  };

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
  };

  const selectedProjects = useMemo(() => {
    return rows.filter((row) => selectedRows.has(row.id));
  }, [selectedRows, rows]);

  const openDeleteDialog = () => {
    dialog(
      <DeleteProjects
        dialog
        projects={selectedProjects}
        callback={(projects) => {
          callback(projects, 'delete');
          toast.success(t('common:success.delete_resources', { resources: t('common:projects') }));
        }}
      />,
      {
        drawerOnMobile: false,
        className: 'max-w-xl',
        title: t('common:delete'),
        text: t('common:confirm.delete_resources', { resources: t('common:projects').toLowerCase() }),
      },
    );
  };

  return (
    <div className="space-y-4 h-full">
      <div className={'flex items-center max-sm:justify-between md:gap-2 mt-4'}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selectedProjects.length > 0 && (
              <>
                <Button variant="destructive" className="relative" onClick={openDeleteDialog}>
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedProjects.length}</Badge>
                  <Trash size={16} />
                  <span className="ml-1 max-lg:hidden">{t('common:remove')}</span>
                </Button>
                <Button variant="ghost" onClick={() => setSelectedRows(new Set<string>())}>
                  <XSquare size={16} />
                  <span className="ml-1">{t('common:clear')}</span>
                </Button>
              </>
            )}

            {selectedProjects.length === 0 && (
              <TableCount count={totalCount} type="project" isFiltered={isFiltered} onResetFilters={onResetFilters} />
            )}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent>
            <TableSearch value={query} setQuery={onSearch} />
          </FilterBarContent>
        </TableFilterBar>
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
      </div>
      <DataTable<Project>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          limit,
          rowHeight: 42,
          selectedRows,
          onRowsChange,
          isLoading: queryResult.isLoading,
          isFetching: queryResult.isFetching,
          onSelectedRowsChange: setSelectedRows,
          rowKeyGetter: (row) => row.id,
          enableVirtualization: false,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:projects').toLowerCase() })} />,
        }}
      />
    </div>
  );
}
