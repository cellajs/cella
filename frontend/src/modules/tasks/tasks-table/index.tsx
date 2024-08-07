import { useSearch } from '@tanstack/react-router';
import { Bird } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import useTaskFilters from '~/hooks/use-filtered-tasks';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import Export from '~/modules/common/data-table/export.tsx';
import { getInitialSortColumns } from '~/modules/common/data-table/init-sort-columns';
import { type Task, useElectric } from '~/modules/common/electric/electrify';
import { WorkspaceTableRoute, type tasksSearchSchema } from '~/routes/workspaces';
import { useWorkspaceStore } from '~/store/workspace';
import { useColumns } from './columns';
import { sheet } from '~/modules/common/sheeter/state';
import { enhanceTasks } from '~/hooks/use-filtered-task-helpers';
import TableHeader from './header/table-header';
import { SearchDropDown } from './header/search-drop-down';
import { TaskTableSearch } from './header/table-search';
import TaskSheet from './task-sheet';
import { useLiveQuery } from 'electric-sql/react';
import { useEventListener } from '~/hooks/use-event-listener';
import ColumnsView from '~/modules/common/data-table/columns-view';
import { openUserPreviewSheet } from '~/modules/common/data-table/util';
import { configureForExport } from './helpers';

type TasksSearch = z.infer<typeof tasksSearchSchema>;

export default function TasksTable() {
  const { t } = useTranslation();
  const search = useSearch({ from: WorkspaceTableRoute.id });
  const { focusedTaskId, searchQuery, selectedTasks, setSelectedTasks, setSearchQuery, projects, labels, setFocusedTaskId } = useWorkspaceStore(
    ({ focusedTaskId, searchQuery, selectedTasks, setSelectedTasks, setSearchQuery, projects, labels, setFocusedTaskId }) => ({
      focusedTaskId,
      searchQuery,
      selectedTasks,
      setSelectedTasks,
      projects,
      setSearchQuery,
      labels,
      setFocusedTaskId,
    }),
  );
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search, 'created_at'));
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

  useSaveInSearchParams(filters, { tableSort: 'created_at', order: 'desc' });

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const Electric = useElectric()!;

  const { results: tasks = [], updatedAt } = useLiveQuery(
    Electric.db.tasks.liveMany({
      where: {
        project_id: {
          in: selectedProjects.length > 0 ? selectedProjects : projects.map((project) => project.id),
        },
        ...(selectedStatuses.length > 0 && {
          status: {
            in: selectedStatuses,
          },
        }),
        AND: [
          {
            description: {
              contains: searchQuery,
            },
          },
        ],
      },
      orderBy: {
        [tableSort || 'created_at']: order || 'desc',
      },
    }),
  ) as {
    results: Task[] | undefined;
    updatedAt: Date | undefined;
  };

  const { showingTasks: rows } = useTaskFilters(
    tasks,
    true,
    true,
    labels,
    projects
      .flatMap((p) => p.members) // Flattens members arrays from all projects
      .filter(
        (user, index, self) => index === self.findIndex((u) => u.id === user.id), // Filters out duplicates based on id
      ),
    true,
  );
  const isLoading = !updatedAt;

  const handleSelectedRowsChange = (selectedRows: Set<string>) => {
    setSelectedTasks(Array.from(selectedRows));
  };

  const onResetFilters = () => {
    setSearchQuery('');
    setSelectedProjects([]);
    setSelectedStatuses([]);
  };

  const handleOpenPreview = (taskId: string) => {
    const relativeTasks = tasks.filter((t) => t.id === taskId || t.parent_id === taskId);
    const [currentTask] = relativeTasks.filter((t) => t.id === taskId);
    const members = projects.find((p) => p.id === currentTask.project_id)?.members || [];
    const [task] = enhanceTasks(relativeTasks, labels, members);
    sheet.create(<TaskSheet task={task} />, {
      className: 'max-w-full lg:max-w-4xl p-0',
      title: <span className="pl-4">{t('common:task')}</span>,
      text: <span className="pl-4">{t('common:task_sheet_text')}</span>,
      id: `task-preview-${taskId}`,
    });
    setFocusedTaskId(taskId);
  };

  useEventListener('openTaskCardPreview', (event) => handleOpenPreview(event.detail));

  useEffect(() => {
    if (!tasks.length || !sheet.get(`preview-${focusedTaskId}`)) return;
    const relativeTasks = tasks.filter((t) => t.id === focusedTaskId || t.parent_id === focusedTaskId);
    const [currentTask] = relativeTasks.filter((t) => t.id === focusedTaskId);
    const members = projects.find((p) => p.id === currentTask.project_id)?.members || [];
    const [task] = enhanceTasks(relativeTasks, labels, members);
    sheet.update(`task-preview-${task.id}`, {
      content: <TaskSheet task={task} />,
    });
  }, [tasks, focusedTaskId]);

  useEffect(() => {
    if (!tasks.length || !search.taskIdPreview) return;
    handleOpenPreview(search.taskIdPreview);
  }, [tasks]);

  useEffect(() => {
    if (!rows.length || !search.userIdPreview) return;
    const task = rows.find((t) => t.virtualCreatedBy?.id === search.userIdPreview);
    if (task?.virtualCreatedBy) openUserPreviewSheet(task.virtualCreatedBy);
  }, [rows]);

  useEffect(() => {
    if (search.q?.length) setSearchQuery(search.q);
    setFocusedTaskId(null);
  }, []);

  return (
    <>
      <TableHeader totalCount={rows.length} isFiltered={isFiltered} onResetFilters={onResetFilters}>
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
          totalCount: rows.length,
          isLoading,
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
