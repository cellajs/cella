import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Bird } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { type GetTasksParams, getTasksList } from '~/api/tasks';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export.tsx';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';

import TableHeader from '~/modules/app/board-header';
import { openUserPreviewSheet } from '~/modules/common/data-table/util';
import { taskKeys } from '~/modules/common/query-client-provider/tasks';
import { sheet } from '~/modules/common/sheeter/state';
import { configureForExport, openTaskPreviewSheet } from '~/modules/tasks/helpers';
import TaskSheet from '~/modules/tasks/task-sheet';
import { useColumns } from '~/modules/tasks/tasks-table/columns';
import { useWorkspaceQuery } from '~/modules/workspaces/helpers/use-workspace';
import { WorkspaceTableRoute, type tasksSearchSchema } from '~/routes/workspaces';
import { useWorkspaceStore } from '~/store/workspace';
import type { Task } from '~/types/app';

type TasksSearch = z.infer<typeof tasksSearchSchema>;

const tasksQueryOptions = ({
  q,
  sort: initialSort,
  order: initialOrder,
  limit = 2000,
  projectId,
  status,
  rowsLength = 0,
  orgIdOrSlug,
}: GetTasksParams & {
  rowsLength?: number;
}) => {
  const sort = initialSort || 'status';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: taskKeys.list({ orgIdOrSlug, projectId, status, q, sort, order }),
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) =>
      await getTasksList(
        {
          page,
          q,
          sort,
          order,
          // Fetch more items than the limit if some items were deleted
          limit: limit + Math.max(page * limit - rowsLength, 0),
          // If some items were added, offset should be undefined, otherwise it should be the length of the rows
          offset: rowsLength - page * limit > 0 ? undefined : rowsLength,
          projectId,
          status,
          orgIdOrSlug,
        },
        signal,
      ),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

export default function TasksTable() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const search = useSearch({ from: WorkspaceTableRoute.id });
  const { searchQuery, selectedTasks, setSelectedTasks, setSearchQuery } = useWorkspaceStore();
  const {
    data: { workspace, projects },
  } = useWorkspaceQuery();

  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search, 'status'));
  const [selectedStatuses] = useState<number[]>(typeof search.status === 'number' ? [search.status] : search.status?.split('_').map(Number) || []);
  const [selectedProjects] = useState<string[]>(search.projectId?.split('_') || []);
  const [columns, setColumns] = useColumns();

  // Search query options
  const sort = sortColumns[0]?.columnKey as TasksSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as TasksSearch['order'];

  const isFiltered = !!searchQuery || selectedStatuses.length > 0 || selectedProjects.length > 0;

  // Save filters in search params
  const filters = useMemo(
    () => ({
      q: searchQuery,
      sort,
      order,
      projectId: selectedProjects,
      status: selectedStatuses,
    }),
    [searchQuery, sort, order, selectedStatuses, selectedProjects],
  );

  useSaveInSearchParams(filters, { sort: 'status', order: 'desc' });

  // Query tasks
  const queryResult = useInfiniteQuery(
    tasksQueryOptions({
      q: searchQuery,
      sort,
      order,
      projectId: search.projectId ? search.projectId : projects.map((p) => p.id).join('_'),
      status: selectedStatuses.join('_'),
      orgIdOrSlug: workspace.organizationId,
    }),
  );

  const rows = useMemo(() => queryResult.data?.pages[0].items || [], [queryResult.data]);
  const totalCount = queryResult.data?.pages[0].total;

  const handleSelectedRowsChange = (selectedRows: Set<string>) => {
    setSelectedTasks(Array.from(selectedRows));
  };

  // const onResetFilters = () => {
  //   setSearchQuery('');
  //   setSelectedProjects([]);
  //   setSelectedStatuses([]);
  // };

  useEffect(() => {
    if (!rows.length) return;
    if (search.taskIdPreview) {
      const [task] = rows.filter((t) => t.id === search.taskIdPreview);

      if (sheet.get(`task-preview-${search.taskIdPreview}`)) {
        sheet.update(`task-preview-${search.taskIdPreview}`, { content: <TaskSheet task={task} /> });
      } else openTaskPreviewSheet(task);
      return;
    }
    if (search.userIdPreview) {
      const [{ createdBy }] = rows.filter((t) => t.createdBy?.id === search.userIdPreview);
      if (createdBy) openUserPreviewSheet(createdBy, navigate);
    }
  }, [rows]);

  // TODO: research how to use search param as state
  useEffect(() => {
    if (search.q?.length) setSearchQuery(search.q);
  }, []);

  return (
    <>
      <TableHeader>
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
        <Export
          className="max-lg:hidden"
          filename={`Tasks from ${projects.map((p) => p.name).join(' and ')}`}
          columns={columns}
          selectedRows={configureForExport(
            rows.filter((t) => selectedTasks.includes(t.id)),
            projects,
          )}
          fetchRows={async (limit) => configureForExport(rows.slice(0, limit), projects)}
        />
      </TableHeader>
      <DataTable<Task>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          rowHeight: 42,
          totalCount,
          isLoading: queryResult.isLoading,
          isFetching: queryResult.isFetching,
          isFiltered,
          selectedRows: new Set<string>(selectedTasks),
          onSelectedRowsChange: handleSelectedRowsChange,
          rowKeyGetter: (row) => row.id,
          enableVirtualization: true,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('app:tasks').toLowerCase() })} />,
        }}
      />
    </>
  );
}
