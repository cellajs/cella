import { Bird } from 'lucide-react';
import { type Key, useEffect, useMemo, useState } from 'react';
import { type RenderRowProps, Row, type SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { type Task, useElectric } from '~/modules/common/electric/electrify';
import { useWorkspaceContext } from '~/modules/workspaces/workspace-context';
import { TaskProvider } from '../task/task-context';
import { useColumns } from './columns';

const renderRow = (key: Key, props: RenderRowProps<Task>) => {
  return (
    <TaskProvider key={key} task={props.row}>
      <Row {...props} />
    </TaskProvider>
  );
};

const LIMIT = 100;

export default function TasksTable() {
  const { t } = useTranslation();
  const { searchQuery, selectedTasks, setSelectedTasks, projects } = useWorkspaceContext(
    ({ searchQuery, selectedTasks, setSelectedTasks, projects }) => ({
      searchQuery,
      selectedTasks,
      setSelectedTasks,
      projects,
    }),
  );
  const [columns] = useColumns();
  const [rows, setRows] = useState<Task[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [offset, setOffset] = useState(0);
  const [isFetching, setIsFetching] = useState(false);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>([{ columnKey: 'created_at', direction: 'DESC' }]);

  const sort = sortColumns[0]?.columnKey;
  const order = sortColumns[0]?.direction.toLowerCase();

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const electric = useElectric()!;

  useEffect(() => {
    (async () => {
      setIsFetching(true);
      const results = await electric.db.tasks.findMany({
        where: {
          project_id: {
            in: projects.map((project) => project.id),
          },
        },
        take: LIMIT,
        skip: offset,
        orderBy: {
          [sort]: order,
        },
      });
      setTasks(results as Task[]);
      setIsFetching(false);
    })();
  }, [projects, sort, order]);

  const filteredTasks = useMemo(() => {
    if (!tasks) return;
    if (!searchQuery) return tasks;
    return tasks.filter(
      (task) =>
        task.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.markdown?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.slug.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [tasks, searchQuery]);

  const fetchMore = async () => {
    setIsFetching(true);
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    const results = await electric.db.tasks.findMany({
      where: {
        project_id: {
          in: projects.map((project) => project.id),
        },
      },
      take: LIMIT,
      skip: newOffset,
      orderBy: {
        [sort]: order,
      },
    });
    setTasks((prevTasks) => [...prevTasks, ...(results as Task[])]);
    setIsFetching(false);
  };

  const onRowsChange = (changedRows: Task[]) => {
    setRows(changedRows);
  };

  const handleSelectedRowsChange = (selectedRows: Set<string>) => {
    setSelectedTasks(Array.from(selectedRows));
  };

  useEffect(() => {
    if (filteredTasks) setRows(filteredTasks);
  }, [filteredTasks]);

  return (
    <div className="space-y-4 h-full">
      <DataTable<Task>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          limit: 10,
          rowHeight: 42,
          onRowsChange,
          isLoading: tasks === undefined,
          isFetching,
          renderRow,
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
    </div>
  );
}
