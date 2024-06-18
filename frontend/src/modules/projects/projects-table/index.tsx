import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import type { getProjectsQuerySchema } from 'backend/modules/projects/schema';
import { Bird } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { type GetProjectsParams, getProjects } from '~/api/projects';
import { useDebounce } from '~/hooks/use-debounce';
import useQueryResultEffect from '~/hooks/use-query-result-effect';
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
import DeleteProjects from '../delete-project';

export type ProjectsSearch = z.infer<typeof getProjectsQuerySchema>;

export const projectsQueryOptions = ({ q, sort: initialSort, order: initialOrder, limit, requestedUserId }: GetProjectsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['projects', q, sort, order],
    initialPageParam: 0,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getProjects({ page, q, sort, order, limit, requestedUserId }, signal),
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

  const onRowsChange = (changedRows: Project[]) => {
    setRows(changedRows);
  };

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
  };

  // Search query options
  const q = useDebounce(query, 200);
  const sort = sortColumns[0]?.columnKey as ProjectsSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as ProjectsSearch['order'];
  const limit = LIMIT;
  const requestedUserId = userId;

  // Query projects
  const queryResult = useInfiniteQuery(projectsQueryOptions({ q, sort, order, limit, requestedUserId }));

  // Total count
  const totalCount = queryResult.data?.pages[0].total;

  const isFiltered = !!q;

  const selectedProjects = useMemo(() => {
    return rows.filter((row) => selectedRows.has(row.id));
  }, [selectedRows, rows]);

  const openDeleteDialog = () => {
    dialog(<DeleteProjects dialog projects={selectedProjects} />, {
      drawerOnMobile: false,
      className: 'max-w-xl',
      title: t('common:delete'),
      text: t('common:confirm.delete_resources', { resources: t('common:projects').toLowerCase() }),
    });
  };

  useQueryResultEffect<Project>({ queryResult, setSelectedRows, setRows, selectedRows });

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
            <TableSearch value={query} setQuery={setQuery} />
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
