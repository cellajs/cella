import { createContext, useContext, useEffect, useState } from 'react';
import type { RowsChangeData } from 'react-data-grid';
import type { Project } from '~/mocks/workspaces';
import type { Task } from '~/modules/common/root/electric';
import { DataTable } from '~/modules/common/data-table';
import { toggleExpand } from '~/modules/common/data-table/toggle-expand';
import { WorkspaceContext } from '../../workspaces';
import { useColumns, type TaskRow } from './columns';

interface ProjectContextValue {
  tasks: Task[];
  project: Project;
}

export const ProjectContext = createContext({} as ProjectContextValue);

export default function TasksTable() {
  const { tasks } = useContext(WorkspaceContext);
  const [rows, setRows] = useState<TaskRow[]>([]);

  const [columns] = useColumns();

  const onRowsChange = (changedRows: TaskRow[], { indexes }: RowsChangeData<TaskRow>) => {
    const rows = toggleExpand(changedRows, indexes);

    setRows(rows);
  };

  useEffect(() => {
    const rows = tasks.map((item) => ({ ...item, _type: 'MASTER' as const, _expanded: false }));

    if (rows) {
      setRows(rows);
    }
  }, [tasks]);

  return (
    <div className="space-y-4 h-full">
      <DataTable<TaskRow>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          limit: 10,
          rowHeight: 42,
          onRowsChange,
          rowKeyGetter: (row) => row.id,
          enableVirtualization: false,
        }}
      />
    </div>
  );
}
