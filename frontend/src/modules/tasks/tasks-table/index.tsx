import { useSearch } from '@tanstack/react-router';
import { Bird } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import Export from '~/modules/common/data-table/export.tsx';
import { getInitialSortColumns } from '~/modules/common/data-table/init-sort-columns';
import { WorkspaceTableRoute, type tasksSearchSchema } from '~/routes/workspaces';
import { useWorkspaceStore } from '~/store/workspace';
import { useColumns } from './columns';
import { sheet } from '~/modules/common/sheeter/state';
import TableHeader from './header/table-header';
import { SearchDropDown } from './header/search-drop-down';
import { TaskTableSearch } from './header/table-search';
import TaskSheet from './task-sheet';
import { useEventListener } from '~/hooks/use-event-listener';
import ColumnsView from '~/modules/common/data-table/columns-view';
import { openUserPreviewSheet } from '~/modules/common/data-table/util';
import { configureForExport } from './helpers';
import { getTasksList, type GetTasksParams } from '~/api/tasks';
import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import type { Task, TaskTableCRUDEvent } from '~/types';
import { useMutateInfiniteQueryData } from '~/hooks/use-mutate-query-data';

type TasksSearch = z.infer<typeof tasksSearchSchema>;

const tasksQueryOptions = ({
  q,
  tableSort: initialSort,
  order: initialOrder,
  limit = 2000,
  projectId,
  status,
  rowsLength = 0,
}: GetTasksParams & {
  rowsLength?: number;
}) => {
  const tableSort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['tasks', projectId, status, q, tableSort, order],
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) =>
      await getTasksList(
        {
          page,
          q,
          tableSort,
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
  const [selectedStatuses, setSelectedStatuses] = useState<number[]>(
    typeof search.status === 'number' ? [search.status] : search.status?.split('_').map(Number) || [],
  );
  const [selectedProjects, setSelectedProjects] = useState<string[]>(search.projectId?.split('_') || []);
  const [columns, setColumns] = useColumns();
  // Search query options
  const tableSort = sortColumns[0]?.columnKey as TasksSearch['tableSort'];
  const order = sortColumns[0]?.direction.toLowerCase() as TasksSearch['order'];

  const isFiltered = !!searchQuery || selectedStatuses.length > 0 || selectedProjects.length > 0;
  // Save filters in search params
  const filters = useMemo(
    () => ({
      q: searchQuery,
      tableSort,
      order,
      projectId: selectedProjects,
      status: selectedStatuses,
    }),
    [searchQuery, tableSort, order, selectedStatuses, selectedProjects],
  );

  useSaveInSearchParams(filters, { tableSort: 'createdAt', order: 'desc' });

  // Query tasks
  const queryResult = useInfiniteQuery(
    tasksQueryOptions({
      q: searchQuery,
      tableSort,
      order,
      projectId: search.projectId ? search.projectId : projects.map((p) => p.id).join('_'),
      status: selectedStatuses.join('_'),
    }),
  );

  const callback = useMutateInfiniteQueryData([
    'tasks',
    search.projectId ? search.projectId : projects.map((p) => p.id).join('_'),
    selectedStatuses.join('_'),
    searchQuery,
    tableSort,
    order,
  ]);

  const rows = useMemo(() => {
    return queryResult.data?.pages?.flatMap((page) => page.items) || [];
  }, [queryResult.data]);

  const totalCount = queryResult.data?.pages[0].total || rows.length;

  const handleSelectedRowsChange = (selectedRows: Set<string>) => {
    setSelectedTasks(Array.from(selectedRows));
  };

  const onResetFilters = () => {
    setSearchQuery('');
    setSelectedProjects([]);
    setSelectedStatuses([]);
  };

  const handleOpenPreview = (taskId: string) => {
    const relativeTasks = rows.filter((t) => t.id === taskId || t.parentId === taskId);
    const [currentTask] = relativeTasks.filter((t) => t.id === taskId);
    sheet.create(<TaskSheet task={currentTask} />, {
      className: 'max-w-full lg:max-w-4xl p-0',
      title: <span className="pl-4">{t('common:task')}</span>,
      text: <span className="pl-4">{t('common:task_sheet_text')}</span>,
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
      content: <TaskSheet task={currentTask} />,
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
      <TableHeader totalCount={totalCount} isFiltered={isFiltered} onResetFilters={onResetFilters}>
        <TaskTableSearch>
          <SearchDropDown
            selectedStatuses={selectedStatuses}
            setSelectedStatuses={setSelectedStatuses}
            selectedProjects={selectedProjects}
            setSelectedProjects={setSelectedProjects}
          />
        </TaskTableSearch>
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
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:tasks').toLowerCase() })} />,
        }}
      />
    </>
  );
}
