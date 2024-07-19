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
import { filterBy, sortBy } from './helpers';

type TasksSearch = z.infer<typeof tasksSearchSchema>;

interface OpenPreviewEvent extends Event {
  detail: {
    taskId: string;
  };
}

export default function TasksTable() {
  const { t } = useTranslation();
  const search = useSearch({ from: WorkspaceTableRoute.id });
  const { focusedTaskId, searchQuery, selectedTasks, setSelectedTasks, projects, members, labels, setFocusedTaskId } = useWorkspaceStore(
    ({ focusedTaskId, searchQuery, selectedTasks, setSelectedTasks, projects, members, labels, setFocusedTaskId }) => ({
      focusedTaskId,
      searchQuery,
      selectedTasks,
      setSelectedTasks,
      projects,
      members,
      labels,
      setFocusedTaskId,
    }),
  );
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search, 'created_at'));
  const [selectedStatuses, setSelectedStatuses] = useState<number[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [fetchedTasks, setFetchedTasks] = useState<Task[]>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useColumns();

  const { showingTasks: rows } = useTaskFilters(tasks, true, true, labels, members, true);
  // Search query options
  const tableSort = sortColumns[0]?.columnKey as TasksSearch['tableSort'];
  const order = sortColumns[0]?.direction.toLowerCase() as TasksSearch['order'];

  const isFiltered = !!searchQuery || selectedStatuses.length > 0 || selectedProjects.length > 0;
  const isLoading = !fetchedTasks;

  // Save filters in search params
  const filters = useMemo(
    () => ({
      q: searchQuery,
      tableSort,
      order,
      project_id: selectedProjects,
      status: selectedStatuses,
    }),
    [searchQuery, tableSort, order, selectedStatuses, selectedProjects],
  );

  useSaveInSearchParams(filters, { tableSort: 'created_at', order: 'desc' });

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const Electric = useElectric()!;

  const handleSelectedRowsChange = (selectedRows: Set<string>) => {
    setSelectedTasks(Array.from(selectedRows));
  };

  useEffect(() => {
    if (!tasks.length || !focusedTaskId || !sheet.get(`task-card-preview-${focusedTaskId}`)) return;
    const relativeTasks = tasks.filter((t) => t.id === focusedTaskId || t.parent_id === focusedTaskId);
    const [task] = enhanceTasks(relativeTasks, labels, members);
    sheet.update(`task-card-preview-${task.id}`, {
      content: <TaskSheet task={task} />,
    });
  }, [tasks, focusedTaskId]);

  useEffect(() => {
    if (fetchedTasks) {
      let filteredTasks = filterBy(fetchedTasks, selectedProjects, selectedStatuses);
      filteredTasks = filteredTasks.filter((t) => t.summary?.includes(searchQuery));
      setTasks(sortBy(filteredTasks, tableSort, order));
    }
  }, [fetchedTasks, selectedProjects, selectedStatuses, searchQuery, tableSort, order]);

  useEffect(() => {
    let isMounted = true; // Track whether the component is mounted
    (async () => {
      if (isMounted) {
        const result = await Electric.db.tasks.findMany({
          where: {
            project_id: {
              in: projects.map((project) => project.id),
            },
          },
        });
        setFetchedTasks(result as Task[]);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleChange = (event: Event) => {
      const { taskId } = (event as OpenPreviewEvent).detail;
      const relativeTasks = tasks.filter((t) => t.id === taskId || t.parent_id === taskId);
      const [task] = enhanceTasks(relativeTasks, labels, members);
      sheet(<TaskSheet task={task} />, {
        className: 'max-w-full lg:max-w-4xl p-0',
        title: <span className="pl-4">Task</span>,
        text: <span className="pl-4">View and manage a specific task</span>,
        id: `task-card-preview-${taskId}`,
      });
      setFocusedTaskId(taskId);
    };

    document.addEventListener('open-task-card-preview', handleChange);
    return () => document.removeEventListener('open-task-card-preview', handleChange);
  });

  return (
    <>
      <TableHeader totalCount={rows.length}>
        <TaskTableSearch>
          <SearchDropDown
            columns={columns}
            setColumns={setColumns}
            selectedStatuses={selectedStatuses}
            setSelectedStatuses={setSelectedStatuses}
            selectedProjects={selectedProjects}
            setSelectedProjects={setSelectedProjects}
          />
        </TaskTableSearch>
        <Export
          className="max-lg:hidden"
          filename={`Tasks from ${projects.map((p) => p.name).join(' and ')}`}
          columns={columns}
          selectedRows={rows.filter((t) => selectedTasks.includes(t.id))}
          fetchRows={async (limit) => rows.slice(0, limit)}
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
