import DataGrid from 'react-data-grid';
import { Check } from 'lucide-react';
import { statusFillColors, taskStatuses, type TaskStatus } from '~/modules/tasks/task-selectors/select-status';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '~/store/workspace';
import { AvatarWrap } from '~/modules/common/avatar-wrap';

export function SearchDropDown({
  selectedProjects,
  setSelectedProjects,
  selectedStatuses,
  setSelectedStatuses,
}: {
  selectedProjects: string[];
  setSelectedProjects: (projects: string[]) => void;
  selectedStatuses: number[];
  setSelectedStatuses: (statuses: number[]) => void;
}) {
  const { t } = useTranslation();
  const { projects } = useWorkspaceStore();

  const handleProjectClick = (value: string) => {
    const existingProject = selectedProjects.find((p) => p === value);
    if (typeof existingProject !== 'undefined') return setSelectedProjects(selectedProjects.filter((p) => p !== value));
    const newProject = projects.find((p) => p.id === value);
    if (newProject) return setSelectedProjects([...selectedProjects, newProject.id]);
  };

  const handleStatusClick = (value: number) => {
    const existingStatus = selectedStatuses.find((status) => status === value);
    if (typeof existingStatus !== 'undefined') return setSelectedStatuses(selectedStatuses.filter((status) => status !== value));
    const newStatus = taskStatuses.find((status) => status.value === value);
    if (newStatus) return setSelectedStatuses([...selectedStatuses, newStatus.value]);
  };

  const innerColumns = [
    { key: 'status', name: 'Filter by status' },
    { key: 'project', name: 'Filter by projects' },
  ];
  const maxLength = Math.max(projects.length, taskStatuses.length);

  const rows = Array.from({ length: maxLength }, (_, index) => {
    const status = taskStatuses[index];
    const project = projects[index];
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
      status: status ? (
        <div className="p-0 flex justify-between items-center w-full leading-normal">
          <div className="flex items-center">
            <status.icon className={`size-4 mr-2 fill-current ${statusFillColors[status.value as TaskStatus]}`} />
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
      }}
      onCellClick={(args) => {
        const index = +args.row.id - 1;
        const type = args.column.key;
        if (type === 'project') handleProjectClick(projects[index].id);
        if (type === 'status') handleStatusClick(taskStatuses[index].value);
      }}
      enableVirtualization
    />
  );
}
