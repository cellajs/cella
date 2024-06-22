import { useLiveQuery } from 'electric-sql/react';
import { Bird } from 'lucide-react';
import { type Key, useEffect, useMemo, useState } from 'react';
import { type RenderRowProps, Row } from 'react-data-grid';
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

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const electric = useElectric()!;
  const { results: tasks, updatedAt } = useLiveQuery(
    electric.db.tasks.liveMany({
      where: {
        project_id: {
          in: projects.map((project) => project.id),
        },
      },
      orderBy: {
        sort_order: 'asc',
      },
    }),
  ) as {
    results: Task[] | undefined;
    updatedAt: Date | undefined;
  };

  const filteredTasks = useMemo(() => {
    if (!tasks) return;
    if (!searchQuery) return tasks;
    return tasks.filter(
      (task) =>
        task.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.markdown?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.slug.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [searchQuery, updatedAt]);

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
          isFetching: tasks === undefined,
          renderRow,
          isFiltered: !!searchQuery,
          selectedRows: new Set<string>(selectedTasks),
          onSelectedRowsChange: handleSelectedRowsChange,
          rowKeyGetter: (row) => row.id,
          enableVirtualization: false,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:tasks').toLowerCase() })} />,
        }}
      />
    </div>
  );
}
