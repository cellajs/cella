import { useSearch } from '@tanstack/react-router';
import { useLiveQuery } from 'electric-sql/react';
import { Bird } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import useTaskFilters from '~/hooks/use-filtered-tasks';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export.tsx';
import { getInitialSortColumns } from '~/modules/common/data-table/init-sort-columns';
import { type Task, useElectric } from '~/modules/common/electric/electrify';
import { WorkspaceTableRoute, type tasksSearchSchema } from '~/routes/workspaces';
import { useWorkspaceStore } from '~/store/workspace';
import BoardHeader from '../board/header/board-header';
import { useColumns } from './columns';
import SelectProject from './project';
import HeaderSelectStatus from './status';

type TasksSearch = z.infer<typeof tasksSearchSchema>;

export default function TasksTable() {
  const { t } = useTranslation();
  const search = useSearch({ from: WorkspaceTableRoute.id });
  const { searchQuery, selectedTasks, setSelectedTasks, projects, setSearchQuery, members, labels } = useWorkspaceStore(
    ({ searchQuery, selectedTasks, setSelectedTasks, projects, setSearchQuery, members, labels }) => ({
      searchQuery,
      selectedTasks,
      setSelectedTasks,
      projects,
      setSearchQuery,
      members,
      labels,
    }),
  );
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search, 'created_at'));
  const [selectedStatuses, setSelectedStatuses] = useState<number[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  // Search query options
  const q = searchQuery;
  const tableSort = sortColumns[0]?.columnKey as TasksSearch['tableSort'];
  const order = sortColumns[0]?.direction.toLowerCase() as TasksSearch['order'];

  const isFiltered = !!q || selectedStatuses.length > 0 || selectedProjects.length > 0;

  // Save filters in search params
  const filters = useMemo(
    () => ({
      q,
      tableSort,
      order,
      project_id: selectedProjects,
      status: selectedStatuses,
    }),
    [q, tableSort, order, selectedStatuses, selectedProjects],
  );

  useSaveInSearchParams(filters, { tableSort: 'created_at', order: 'desc' });

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
        OR: [
          {
            markdown: {
              contains: q,
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

  const [columns, setColumns] = useColumns(tasks);
  const isLoading = !updatedAt;
  const { showingTasks: rows } = useTaskFilters(tasks, true, true, labels, members, true);
  // const onResetFilters = () => {
  //   setSearchQuery('');
  //   setSelectedTasks([]);
  //   setSelectedStatuses([]);
  // };

  const handleSelectedRowsChange = (selectedRows: Set<string>) => {
    setSelectedTasks(Array.from(selectedRows));
  };

  useEffect(() => {
    if (search.q) setSearchQuery(search.q);
  }, []);

  return (
    <>
      <BoardHeader mode="table" totalCount={rows.length}>
        <HeaderSelectStatus selectedStatuses={selectedStatuses} setSelectedStatuses={setSelectedStatuses} />
        <SelectProject projects={projects} selectedProjects={selectedProjects} setSelectedProjects={setSelectedProjects} />
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
        <Export
          className="max-lg:hidden"
          filename={`Tasks from ${projects.map((p) => p.name).join(' and ')}`}
          columns={columns}
          selectedRows={rows.filter((t) => selectedTasks.includes(t.id))}
          fetchRows={async (limit) => rows.slice(0, limit)}
        />
      </BoardHeader>
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
