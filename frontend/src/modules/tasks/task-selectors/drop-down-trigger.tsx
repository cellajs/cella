import { dropdowner } from '~/modules/common/dropdowner/state';
import type { TaskImpact, TaskType } from '~/modules/tasks/create-task-form';
import SelectImpact from '~/modules/tasks/task-selectors/select-impact';
import SetLabels from '~/modules/tasks/task-selectors/select-labels';
import AssignMembers from '~/modules/tasks/task-selectors/select-members';
import SelectStatus, { type TaskStatus } from '~/modules/tasks/task-selectors/select-status';
import SelectTaskType from '~/modules/tasks/task-selectors/select-task-type';
import type { Task } from '~/types/app';

export const handleTaskDropDownClick = (task: Task, field: string, trigger: HTMLElement) => {
  let component = <SelectTaskType currentType={task.type as TaskType} projectId={task.projectId} />;
  if (field.includes('impact')) component = <SelectImpact value={task.impact as TaskImpact} projectId={task.projectId} />;
  else if (field.includes('labels')) component = <SetLabels value={task.labels} organizationId={task.organizationId} projectId={task.projectId} />;
  else if (field.includes('assignedTo')) component = <AssignMembers projectId={task.projectId} value={task.assignedTo} />;
  else if (field.includes('status')) component = <SelectStatus taskStatus={task.status as TaskStatus} projectId={task.projectId} />;
  return dropdowner(component, { id: field, trigger, align: field.startsWith('status') || field.startsWith('assignedTo') ? 'end' : 'start' });
};
