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
import { useWorkspaceStore } from '~/store/workspace';

const LIMIT = 100;

export default function TasksTable() {
  const { t } = useTranslation();
  const { searchQuery, selectedTasks, setSelectedTasks, projects } = useWorkspaceStore();

  const [columns, setColumns] = useColumns();
  const [rows, setRows] = useState<Task[]>([]);
  const [tasks, setTasks] = useState<Task[]>();
  const [selectedStatuses, setSelectedStatuses] = useState<number[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const [isFetching, setIsFetching] = useState(false);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>([{ columnKey: 'created_at', direction: 'DESC' }]);

  const sort = sortColumns[0]?.columnKey;
  const order = sortColumns[0]?.direction.toLowerCase();

  // const isFiltered = !!searchQuery || selectedStatuses.length > 0;

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
              contains: searchQuery,
            },
          },
          {
            markdown: {
              contains: searchQuery,
            },
          },
        ],
      },
      take: LIMIT,
      skip: offset,
      orderBy: {
        [sort]: order,
      },
    };
  }, [projects, sort, order, searchQuery, selectedStatuses, offset, selectedProjects]);

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
  }, [searchQuery, selectedStatuses, selectedProjects, sort, order]);

  const fetchMore = async () => {
    setIsFetching(true);
    const newOffset = offset + LIMIT;
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
        {/* <Export
          className="max-lg:hidden"
          filename={`${config.slug}-organizations`}
          columns={columns}
          selectedRows={selectedOrganizations}
          fetchRows={async (limit) => {
            const { items } = await getOrganizations({ limit, q: query, sort, order });
            return items;
          }}
        /> */}
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
          isFiltered: !!searchQuery,
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
