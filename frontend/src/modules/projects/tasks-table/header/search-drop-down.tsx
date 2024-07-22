import DataGrid from 'react-data-grid';
import { Check } from 'lucide-react';
import { taskStatuses } from '../../task/task-selectors/select-status';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '~/store/workspace';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { type Dispatch, type SetStateAction, useMemo } from 'react';
import type { Task } from '~/modules/common/electric/electrify';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';

export function SearchDropDown({
  columns,
  setColumns,
  selectedProjects,
  setSelectedProjects,
  selectedStatuses,
  setSelectedStatuses,
}: {
  columns: ColumnOrColumnGroup<Task>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Task>[]>>;
  selectedProjects: string[];
  setSelectedProjects: (projects: string[]) => void;
  selectedStatuses: number[];
  setSelectedStatuses: (statuses: number[]) => void;
}) {
  const { t } = useTranslation();
  const { projects } = useWorkspaceStore();

  const filteredColumns = useMemo(() => columns.filter((column) => typeof column.name === 'string' && column.name), [columns]);

  const handleProjectClick = (value: string) => {
    const existingProject = selectedProjects.find((p) => p === value);
    if (typeof existingProject !== 'undefined') return setSelectedProjects(selectedProjects.filter((p) => p !== value));
    const newProject = projects.find((p) => p.id === value);
    if (newProject) return setSelectedProjects([...selectedProjects, newProject.id]);
  };

  const handleColumnClick = (value: string) => {
    setColumns((columns) =>
      columns.map((c) =>
        c.name === value
          ? {
              ...c,
              visible: !c.visible,
            }
          : c,
      ),
    );
  };

  const handleStatusClick = (value: number) => {
    const existingStatus = selectedStatuses.find((status) => status === value);
    if (typeof existingStatus !== 'undefined') return setSelectedStatuses(selectedStatuses.filter((status) => status !== value));
    const newStatus = taskStatuses.find((status) => status.value === value);
    if (newStatus) return setSelectedStatuses([...selectedStatuses, newStatus.value]);
  };

  const innerColumns = [
    { key: 'column', name: 'Shoved columns' },
    { key: 'status', name: 'Filter by status' },
    { key: 'project', name: 'Filter by projects' },
  ];
  const maxLength = Math.max(projects.length, columns.length, taskStatuses.length) - 1;

  const rows = Array.from({ length: maxLength }, (_, index) => {
    const status = taskStatuses[index];
    const project = projects[index];
    const column = filteredColumns[index];
    return {
      id: `${index + 1}`,
      project: project ? (
        <div className="p-0 flex justify-between items-center w-full leading-normal">
          <div className="flex gap-2">
            <AvatarWrap type="project" className="h-6 w-6 text-xs" id={project.id} name={project.name} url={project.thumbnailUrl} />
            <span>{project.name}</span>
          </div>
          <div className="flex items-center">{selectedProjects.some((s) => s === project.id) && <Check size={16} className="text-success" />}</div>
        </div>
      ) : (
        ''
      ),
      column: column ? (
        <div className="p-0 flex justify-between items-center w-full leading-normal">
          <span>{column.name}</span>
          <div className="flex items-center">{column.visible && <Check size={16} className="text-success" />}</div>
        </div>
      ) : (
        ''
      ),
      status: status ? (
        <div className="p-0 flex justify-between items-center w-full leading-normal">
          <div className="flex items-center">
            <status.icon className="mr-2 size-4" />
            <span>{t(status.status)}</span>
          </div>
          <div className="flex items-center">{selectedStatuses.some((s) => s === status.value) && <Check size={16} className="text-success" />}</div>
        </div>
      ) : (
        ''
      ),
    };
  });

  return (
    <DataGrid
      className="grow w-full"
      columns={innerColumns}
      rows={rows}
      rowHeight={42}
      rowKeyGetter={(row) => row.id}
      onCellKeyDown={(args, event) => {
        if (event.key !== 'Enter') return;
        const index = args.rowIdx;
        const type = args.column.key;
        if (type === 'project') handleProjectClick(projects[index].id);
        if (type === 'status') handleStatusClick(taskStatuses[index].value);
        if (type === 'column') handleColumnClick(filteredColumns[index].name as string);
      }}
      onCellClick={(args) => {
        const index = +args.row.id - 1;
        const type = args.column.key;
        if (type === 'project') handleProjectClick(projects[index].id);
        if (type === 'status') handleStatusClick(taskStatuses[index].value);
        if (type === 'column') handleColumnClick(filteredColumns[index].name as string);
      }}
      enableVirtualization
    />
  );
}
