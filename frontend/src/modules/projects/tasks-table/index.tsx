import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { RowsChangeData } from 'react-data-grid';
import type { Project } from '~/mocks/workspaces';
import { DataTable } from '~/modules/common/data-table';
import { toggleExpand } from '~/modules/common/data-table/toggle-expand';
import type { Task } from '~/modules/common/root/electric';
import { WorkspaceContext } from '../../workspaces';
import { type TaskRow, useColumns } from './columns';

interface ProjectContextValue {
  tasks: Task[];
  project: Project;
}

export const ProjectContext = createContext({} as ProjectContextValue);

export default function TasksTable() {
  const { tasks, searchQuery, selectedTasks, setSelectedTasks } = useContext(WorkspaceContext);
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
          selectedRows: new Set<string>(selectedTasks),
          onSelectedRowsChange: handleSelectedRowsChange,
          rowKeyGetter: (row) => row.id,
          enableVirtualization: false,
        }}
      />
    </div>
  );
}
