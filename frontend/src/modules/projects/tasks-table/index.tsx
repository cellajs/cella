import { Bird } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { type Task, useElectric } from '~/modules/common/electric/electrify';
import { useColumns } from './columns';
import SelectStatus from './status';
import { useLiveQuery } from 'electric-sql/react';
import ColumnsView from '~/modules/common/data-table/columns-view';
import SelectProject from './project';
import BoardHeader from '../board/header/board-header';
import { useSearch } from '@tanstack/react-router';
import { WorkspaceTableRoute, type tasksSearchSchema } from '~/routes/workspaces';
import { getInitialSortColumns } from '~/modules/common/data-table/init-sort-columns';
import { useDebounce } from '~/hooks/use-debounce';
import type { z } from 'zod';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { useWorkspaceStore } from '~/store/workspace';

type TasksSearch = z.infer<typeof tasksSearchSchema>;

export default function TasksTable() {
  const search = useSearch({ from: WorkspaceTableRoute.id });

  const { t } = useTranslation();
  const { searchQuery, selectedTasks, setSelectedTasks, projects, setSearchQuery } = useWorkspaceStore(
    ({ searchQuery, selectedTasks, setSelectedTasks, projects, setSearchQuery }) => ({
      searchQuery,
      selectedTasks,
      setSelectedTasks,
      projects,
      setSearchQuery,
    }),
  );
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search, 'created_at'));
  const [columns, setColumns] = useColumns();
  const [rows, setRows] = useState<Task[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<number[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  // Search query options
  const q = useDebounce(searchQuery, 200);
  const sort = sortColumns[0]?.columnKey as TasksSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as TasksSearch['order'];

  const isFiltered = !!q || selectedStatuses.length > 0 || selectedProjects.length > 0;

  useEffect(() => {
    if (search.q) {
      setSearchQuery(search.q);
    }
  }, []);

  // Save filters in search params
  const filters = useMemo(
    () => ({
      q,
      sort,
      order,
      project_id: selectedProjects,
      status: selectedStatuses,
    }),
    [q, sort, order, selectedStatuses, selectedProjects],
  );
  useSaveInSearchParams(filters, { sort: 'created_at', order: 'desc' });

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const electric = useElectric()!;

  // TODO: Refactor this when Electric supports count
  const { results: tasks = [], updatedAt } = useLiveQuery(
    electric.db.tasks.liveMany({
      where: {
        project_id: {
          in: selectedProjects.length > 0 ? selectedProjects : projects.map((project) => project.id),
        },
        ...(selectedStatuses.length > 0 && {
          status: {
            in: selectedStatuses,
          },
        }),
        parent_id: null,
        OR: [
          {
            summary: {
              contains: q,
            },
          },
          {
            markdown: {
              contains: q,
            },
          },
        ],
      },
      orderBy: {
        [sort || 'created_at']: order,
      },
    }),
  ) as {
    results: Task[] | undefined;
    updatedAt: Date | undefined;
  };

  const isLoading = !updatedAt;

  // const onResetFilters = () => {
  //   setSearchQuery('');
  //   setSelectedTasks([]);
  //   setSelectedStatuses([]);
  // };

  const onRowsChange = (changedRows: Task[]) => {
    setRows(changedRows);
  };

  const handleSelectedRowsChange = (selectedRows: Set<string>) => {
    setSelectedTasks(Array.from(selectedRows));
  };

  useEffect(() => {
    if (tasks)
      setRows(
        tasks
          .filter((task) => !task.parent_id)
          .map((task) => ({
            ...task,
            subTasks: tasks.filter((t) => t.parent_id === task.id),
          })),
      );
  }, [tasks]);

  return (
    <>
      <BoardHeader mode="table">
        <SelectStatus selectedStatuses={selectedStatuses} setSelectedStatuses={setSelectedStatuses} />
        <SelectProject projects={projects} selectedProjects={selectedProjects} setSelectedProjects={setSelectedProjects} />
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
      </BoardHeader>
      <DataTable<Task>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          rowHeight: 42,
          onRowsChange,
          totalCount: tasks.length,
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
