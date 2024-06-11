import { useEffect, useMemo, useState } from 'react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { toggleExpand } from '~/modules/common/data-table/toggle-expand';
import { type TaskRow, useColumns } from './columns';
import { Bird } from 'lucide-react';
import { useWorkspaceContext } from '~/modules/workspaces/workspace-context';
import { useProjectContext } from '../board/project-context';

export default function TasksTable() {
  const { t } = useTranslation();
  const { tasks } = useProjectContext(({ tasks }) => ({ tasks }));
  const { searchQuery, selectedTasks, setSelectedTasks } = useWorkspaceContext(({ searchQuery, selectedTasks, setSelectedTasks }) => ({
    searchQuery,
    selectedTasks,
    setSelectedTasks,
  }));
  const [rows, setRows] = useState<TaskRow[]>([]);

  const filteredTasks = useMemo(() => {
    if (!searchQuery) return tasks;
    return tasks.filter(
      (task) =>
        task.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.markdown?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.slug.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [searchQuery, tasks]);

  const [columns] = useColumns();

  const onRowsChange = (changedRows: TaskRow[], { indexes }: RowsChangeData<TaskRow>) => {
    const rows = toggleExpand(changedRows, indexes);

    setRows(rows);
  };

  const handleSelectedRowsChange = (selectedRows: Set<string>) => {
    setSelectedTasks(Array.from(selectedRows));
  };

  useEffect(() => {
    const rows = filteredTasks.map((item) => ({ ...item, _type: 'MASTER' as const, _expanded: false }));
    if (rows) setRows(rows);
  }, [filteredTasks]);

  return (
    <div className="space-y-4 h-full">
      <DataTable<TaskRow>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          limit: 10,
          rowHeight: 42,
          onRowsChange,
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
