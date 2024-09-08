import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { type DropDownT, type DropDownToRemove, dropdowner, dropdownerState } from '~/modules/common/dropdowner/state';
import type { TaskImpact, TaskType } from '~/modules/tasks/create-task-form';
import { SelectImpact } from '~/modules/tasks/task-selectors/select-impact';
import SetLabels from '~/modules/tasks/task-selectors/select-labels';
import AssignMembers from '~/modules/tasks/task-selectors/select-members';
import SelectStatus, { type TaskStatus } from '~/modules/tasks/task-selectors/select-status';
import { SelectTaskType } from '~/modules/tasks/task-selectors/select-task-type';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import type { Task } from '~/types/app';

export const handleTaskDropDownClick = (task: Task, field: string, trigger: HTMLElement) => {
  let component = <SelectTaskType currentType={task.type as TaskType} />;
  if (field === 'impact') component = <SelectImpact value={task.impact as TaskImpact} />;
  else if (field === 'labels') component = <SetLabels value={task.labels} organizationId={task.organizationId} projectId={task.projectId} />;
  else if (field === 'assignedTo') component = <AssignMembers projectId={task.projectId} value={task.assignedTo} />;
  else if (field.includes('status')) component = <SelectStatus taskStatus={task.status as TaskStatus} projectId={task.projectId} />;

  return dropdowner(component, { id: field, trigger, align: field.startsWith('status') || field === 'assignedTo' ? 'end' : 'start' });
};

export function DropDowner() {
  const [dropdowner, setDropdowner] = useState<DropDownT | null>(null);

  useEffect(() => {
    return dropdownerState.subscribe((dropdowner) => {
      if ((dropdowner as DropDownToRemove).remove) setDropdowner(null);
      else setDropdowner(dropdowner as DropDownT);
    });
  }, []);

  if (!dropdowner?.trigger) return null;

  const dropdownContainer = document.createElement('div');
  dropdownContainer.classList.add('absolute', 'bottom-0', dropdowner.align === 'start' ? 'left-0' : 'right-0');
  dropdowner.trigger.appendChild(dropdownContainer);

  return ReactDOM.createPortal(
    <DropdownMenu key={dropdowner.id} open={true}>
      <DropdownMenuTrigger />
      <DropdownMenuContent
        className="p-0"
        sideOffset={12}
        side="bottom"
        align={dropdowner.align || 'start'}
        onCloseAutoFocus={() => {
          if (dropdowner.refocus && dropdowner.trigger) dropdowner.trigger.focus();
        }}
        onEscapeKeyDown={() => dropdownerState.remove()}
        onInteractOutside={() => dropdownerState.remove()}
      >
        {dropdowner.content}
      </DropdownMenuContent>
    </DropdownMenu>,
    dropdownContainer,
  );
}
