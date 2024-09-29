import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { Bird } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { type GetTasksParams, getTasksList, updateTask } from '~/api/tasks';
import { useEventListener } from '~/hooks/use-event-listener';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { useMutateInfiniteTaskQueryData } from '~/hooks/use-mutate-query-data';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export.tsx';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';

import { openUserPreviewSheet } from '~/modules/common/data-table/util';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { sheet } from '~/modules/common/sheeter/state';
import { isSubTaskData } from '~/modules/projects/board/board';
import { configureForExport, getRelativeTaskOrder, sortAndGetCounts } from '~/modules/tasks/helpers';
import { TaskCard } from '~/modules/tasks/task';
import { handleTaskDropDownClick } from '~/modules/tasks/task-selectors/drop-down-trigger';
import { useColumns } from '~/modules/tasks/tasks-table/columns';
import TableHeader from '~/modules/tasks/tasks-table/header/table-header';
import { TaskTableSearch } from '~/modules/tasks/tasks-table/header/table-search';
import type { TaskTableOperationEvent } from '~/modules/tasks/types';
import { WorkspaceTableRoute, type tasksSearchSchema } from '~/routes/workspaces';
import { useThemeStore } from '~/store/theme';
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
          orgIdOrSlug,
        },
        signal,
      ),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

export default function TasksTable() {
  const { t } = useTranslation();
  const { mode } = useThemeStore();
  const search = useSearch({ from: WorkspaceTableRoute.id });
  const { focusedTaskId, searchQuery, selectedTasks, setSelectedTasks, setSearchQuery, projects, setFocusedTaskId, workspace } = useWorkspaceStore();

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
      orgIdOrSlug: workspace.organizationId,
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
    sheet.create(<TaskCard mode={mode} task={currentTask} tasks={rows} state="editing" isSelected={false} isFocused={true} isSheet />, {
      className: 'max-w-full lg:max-w-4xl',
      title: <span className="pl-4">{t('app:task')}</span>,
      id: `task-preview-${taskId}`,
    });
    setFocusedTaskId(taskId);
  };

  const handleCRUD = (event: TaskTableOperationEvent) => {
    const { array, action } = event.detail;
    callback(array, action);
  };

  // Open on key press
  const hotKeyPress = (field: string) => {
    const focusedTask = rows.find((t) => t.id === focusedTaskId);
    if (!focusedTask) return;
    const taskCard = document.getElementById(focusedTask.id);
    if (!taskCard) return;
    if (taskCard && document.activeElement !== taskCard) taskCard.focus();
    const trigger = taskCard.querySelector(`#${field}`);
    if (!trigger) return dropdowner.remove();
    handleTaskDropDownClick(focusedTask, field, trigger as HTMLElement);
  };

  useHotkeys([
    ['A', () => hotKeyPress('assignedTo')],
    ['I', () => hotKeyPress('impact')],
    ['L', () => hotKeyPress('labels')],
    ['S', () => hotKeyPress(`status-${focusedTaskId}`)],
    ['T', () => hotKeyPress('type')],
  ]);
  useEventListener('openTaskCardPreview', (event) => handleOpenPreview(event.detail));
  useEventListener('taskTableOperation', handleCRUD);

  useEffect(() => {
    if (!rows.length || !sheet.get(`task-preview-${focusedTaskId}`)) return;
    const relativeTasks = rows.filter((t) => t.id === focusedTaskId || t.parentId === focusedTaskId);
    const [currentTask] = relativeTasks.filter((t) => t.id === focusedTaskId);
    sheet.update(`task-preview-${currentTask.id}`, {
      content: <TaskCard mode={mode} task={currentTask} tasks={rows} state="editing" isSelected={false} isFocused={true} isSheet />,
    });
  }, [rows, focusedTaskId]);

  useEffect(() => {
    if (!rows.length) return;
    if (search.taskIdPreview) return handleOpenPreview(search.taskIdPreview);
    if (search.userIdPreview) {
      const [{ createdBy }] = rows.filter((t) => t.createdBy?.id === search.userIdPreview);
      if (createdBy) openUserPreviewSheet(createdBy);
    }
  }, [rows]);

  useEffect(() => {
    if (search.q?.length) setSearchQuery(search.q);
    setFocusedTaskId(null);
  }, []);

  useEffect(() => {
    return combine(
      monitorForElements({
        canMonitor({ source }) {
          return isSubTaskData(source.data) && sheet.getAll().length;
        },
        async onDrop({ location, source }) {
          const target = location.current.dropTargets[0];
          if (!target) return;
          const sourceData = source.data;
          const targetData = target.data;

          const edge: Edge | null = extractClosestEdge(targetData);
          const isSubTask = isSubTaskData(sourceData) && isSubTaskData(targetData);
          if (!edge || !isSubTask) return;
          const newOrder: number = getRelativeTaskOrder(edge, rows, targetData.order, sourceData.item.id, targetData.item.parentId ?? undefined);
          try {
            const updatedTask = await updateTask(sourceData.item.id, workspace.organizationId, 'order', newOrder);
            callback([updatedTask], 'updateSubTask');
          } catch (err) {
            toast.error(t('common:error.reorder_resources', { resources: t('app:todo') }));
          }
        },
      }),
    );
  }, [rows]);

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
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('app:tasks').toLowerCase() })} />,
        }}
      />
    </>
  );
}
