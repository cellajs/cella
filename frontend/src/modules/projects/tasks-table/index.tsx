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
import { WorkspaceTableRoute, tasksSearchSchema } from '~/routes/workspaces';
import { getInitialSortColumns } from '~/modules/common/data-table/init-sort-columns';
import { useDebounce } from '~/hooks/use-debounce';
import { z } from 'zod';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { useWorkspaceStore } from '~/store/workspace';

const LIMIT = 2000;

type TasksSearch = z.infer<typeof tasksSearchSchema>;

export default function TasksTable() {
  const search = useSearch({ from: WorkspaceTableRoute.id });
  
  const { t } = useTranslation();
  const { searchQuery, selectedTasks, setSelectedTasks, projects } = useWorkspaceStore(
    ({ searchQuery, selectedTasks, setSelectedTasks, projects }) => ({
      searchQuery,
      selectedTasks,
      setSelectedTasks,
      projects
    }),
  );
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search, 'created_at'));
  const [columns, setColumns] = useColumns();
  const [rows, setRows] = useState<Task[]>([]);
  const [tasks, setTasks] = useState<Task[]>();
  const [selectedStatuses, setSelectedStatuses] = useState<number[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const [isFetching, setIsFetching] = useState(false);

  // Search query options
  const q = useDebounce(search.q || searchQuery, 200);
  const sort = sortColumns[0]?.columnKey as TasksSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as TasksSearch['order'];
  const limit = LIMIT;

  const isFiltered = !!q;

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

  const queryOptions = useMemo(() => {
    return {
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
      take: limit,
      skip: offset,
      orderBy: {
        [sort || 'created_at']: order,
      },
    };
  }, [projects, sort, order, q, selectedStatuses, offset, selectedProjects]);

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const electric = useElectric()!;

  // TODO: Refactor this when Electric supports count
  const { results: allTasks } = useLiveQuery(
    electric.db.tasks.liveMany({
      select: {
        id: true,
      },
      where: queryOptions.where,
    }),
  );

  useEffect(() => {
    (async () => {
      setIsFetching(true);
      const newOffset = 0;
      setOffset(newOffset);
      const results = await electric.db.tasks.findMany({
        ...queryOptions,
      });
      setTasks(results as Task[]);
      setIsFetching(false);
    })();
  }, [q, selectedStatuses, selectedProjects, sort, order]);

  const fetchMore = async () => {
    setIsFetching(true);
    const newOffset = offset + limit;
    setOffset(newOffset);
    const results = await electric.db.tasks.findMany({
      ...queryOptions,
      skip: newOffset,
    });
    setTasks((prevTasks) => [...(prevTasks || []), ...(results as Task[])]);
    setIsFetching(false);
  };

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
          limit: 10,
          rowHeight: 42,
          onRowsChange,
          totalCount: allTasks?.length,
          isLoading: tasks === undefined,

          isFetching,
          isFiltered,
          selectedRows: new Set<string>(selectedTasks),
          onSelectedRowsChange: handleSelectedRowsChange,
          fetchMore,
          rowKeyGetter: (row) => row.id,
          enableVirtualization: false,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:tasks').toLowerCase() })} />,
        }}
      />
    </>
  );
}
