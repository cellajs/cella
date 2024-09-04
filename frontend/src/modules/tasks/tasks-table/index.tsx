import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { Bird } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { type GetTasksParams, getTasksList } from '~/api/tasks';
import { useEventListener } from '~/hooks/use-event-listener';
import { useMutateInfiniteTaskQueryData } from '~/hooks/use-mutate-query-data';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import type { TaskTableCRUDEvent } from '~/lib/custom-events/types';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export.tsx';
import { getInitialSortColumns } from '~/modules/common/data-table/init-sort-columns';
import { openUserPreviewSheet } from '~/modules/common/data-table/util';
import { sheet } from '~/modules/common/sheeter/state';
import { configureForExport, sortAndGetCounts } from '~/modules/tasks/helpers';
import { useColumns } from '~/modules/tasks/tasks-table/columns';
import TableHeader from '~/modules/tasks/tasks-table/header/table-header';
import { TaskTableSearch } from '~/modules/tasks/tasks-table/header/table-search';
import TaskSheet from '~/modules/tasks/tasks-table/task-sheet';
import { WorkspaceTableRoute, type tasksSearchSchema } from '~/routes/workspaces';
import { useWorkspaceStore } from '~/store/workspace';
import type { Task } from '~/types';

type TasksSearch = z.infer<typeof tasksSearchSchema>;

const tasksQueryOptions = ({
  q,
  sort: initialSort,
  order: initialOrder,
  limit = 2000,
  projectId,
  status,
  rowsLength = 0,
}: GetTasksParams & {
  rowsLength?: number;
}) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['tasks', projectId, status, q, sort, order],
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
        },
        signal,
      ),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

export default function TasksTable() {
  const { t } = useTranslation();
  const search = useSearch({ from: WorkspaceTableRoute.id });
  const { focusedTaskId, searchQuery, selectedTasks, setSelectedTasks, setSearchQuery, projects, setFocusedTaskId } = useWorkspaceStore(
    ({ focusedTaskId, searchQuery, selectedTasks, setSelectedTasks, setSearchQuery, projects, setFocusedTaskId }) => ({
      focusedTaskId,
      searchQuery,
      selectedTasks,
      setSelectedTasks,
      projects,
      setSearchQuery,
      setFocusedTaskId,
    }),
  );

  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search, 'createdAt'));
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

  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  // Query tasks
  const tasksQuery = useInfiniteQuery(
    tasksQueryOptions({
      q: searchQuery,
      sort,
      order,
      projectId: search.projectId ? search.projectId : projects.map((p) => p.id).join('_'),
      status: selectedStatuses.join('_'),
    }),
  );

  const callback = useMutateInfiniteTaskQueryData([
    'tasks',
    search.projectId ? search.projectId : projects.map((p) => p.id).join('_'),
    selectedStatuses.join('_'),
    searchQuery,
    sort,
    order,
  ]);

  const tasks = useMemo(() => tasksQuery.data?.pages[0].items || [], [tasksQuery.data]);

  const { sortedTasks: rows } = useMemo(() => sortAndGetCounts(tasks, true, true), [tasks]);

  const totalCount = rows.length;

  const handleSelectedRowsChange = (selectedRows: Set<string>) => {
    setSelectedTasks(Array.from(selectedRows));
  };

  // const onResetFilters = () => {
  //   setSearchQuery('');
  //   setSelectedProjects([]);
  //   setSelectedStatuses([]);
  // };

  const handleOpenPreview = (taskId: string) => {
    const relativeTasks = rows.filter((t) => t.id === taskId || t.parentId === taskId);
    const [currentTask] = relativeTasks.filter((t) => t.id === taskId);
    sheet.create(<TaskSheet task={currentTask} tasks={rows} callback={callback} />, {
      className: 'max-w-full lg:max-w-4xl',
      title: <span className="pl-4">{t('common:task')}</span>,
      id: `task-preview-${taskId}`,
    });
    setFocusedTaskId(taskId);
  };

  const handleCRUD = (event: TaskTableCRUDEvent) => {
    const { array, action } = event.detail;
    callback(array, action);
  };

  useEventListener('openTaskCardPreview', (event) => handleOpenPreview(event.detail));
  useEventListener('taskTableCRUD', handleCRUD);

  useEffect(() => {
    if (!rows.length || !sheet.get(`preview-${focusedTaskId}`)) return;
    const relativeTasks = rows.filter((t) => t.id === focusedTaskId || t.parentId === focusedTaskId);
    const [currentTask] = relativeTasks.filter((t) => t.id === focusedTaskId);
    sheet.update(`task-preview-${currentTask.id}`, {
      content: <TaskSheet task={currentTask} tasks={rows} callback={callback} />,
    });
  }, [rows, focusedTaskId]);

  useEffect(() => {
    if (!rows.length || !search.taskIdPreview) return;
    handleOpenPreview(search.taskIdPreview);
  }, [rows]);

  useEffect(() => {
    if (!rows.length || !search.userIdPreview) return;
    const task = rows.find((t) => t.createdBy?.id === search.userIdPreview);
    if (task?.createdBy) openUserPreviewSheet(task.createdBy);
  }, [rows]);

  useEffect(() => {
    if (search.q?.length) setSearchQuery(search.q);
    setFocusedTaskId(null);
  }, []);

  return (
    <>
      <TableHeader>
        <TaskTableSearch />
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
          isLoading: tasksQuery.isLoading,
          isFetching: tasksQuery.isFetching,
          isFiltered,
          selectedRows: new Set<string>(selectedTasks),
          onSelectedRowsChange: handleSelectedRowsChange,
          rowKeyGetter: (row) => row.id,
          enableVirtualization: true,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:tasks').toLowerCase() })} />,
        }}
      />
    </>
  );
}
