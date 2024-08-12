import { dropdowner } from '~/modules/common/dropdowner/state';
import type { TaskImpact, TaskType } from '~/modules/tasks/create-task-form';
import { getTaskOrder } from '../helpers';
import { TaskCard } from '~/modules/tasks/task';
import { SelectImpact } from '~/modules/tasks/task-selectors/select-impact';
import SetLabels from '~/modules/tasks/task-selectors/select-labels';
import AssignMembers from '~/modules/tasks/task-selectors/select-members';
import SelectStatus, { type TaskStatus } from '~/modules/tasks/task-selectors/select-status';
import { SelectTaskType } from '~/modules/tasks/task-selectors/select-task-type';
import { useThemeStore } from '~/store/theme';
import type { Task } from '~/types';
import { updateTask } from '~/api/tasks';

const TaskSheet = ({ task }: { task: Task }) => {
  const { mode } = useThemeStore();

  const handleChange = async (field: string, value: string | number | null, taskId: string) => {
    const newOrder = field === 'status' ? getTaskOrder(taskId, value, []) : null;
    await updateTask(taskId, field, value, newOrder);
  };

  const handleTaskActionClick = (task: Task, field: string, trigger: HTMLElement) => {
    let component = <SelectTaskType currentType={task.type as TaskType} changeTaskType={(newType) => handleChange('type', newType, task.id)} />;

    if (field === 'impact')
      component = <SelectImpact value={task.impact as TaskImpact} changeTaskImpact={(newImpact) => handleChange('impact', newImpact, task.id)} />;
    else if (field === 'labels') component = <SetLabels value={task.virtualLabels} organizationId={task.organizationId} projectId={task.projectId} />;
    else if (field === 'assignedTo') component = <AssignMembers projectId={task.projectId} value={task.virtualAssignedTo} />;
    else if (field === 'status')
      component = (
        <SelectStatus taskStatus={task.status as TaskStatus} changeTaskStatus={(newStatus) => handleChange('status', newStatus, task.id)} />
      );

    return dropdowner(component, { id: field, trigger, align: ['status', 'assignedTo'].includes(field) ? 'end' : 'start' });
  };

  return (
    <TaskCard
      mode={mode}
      task={task}
      isExpanded={true}
      isSelected={false}
      isFocused={true}
      handleTaskChange={handleChange}
      handleTaskActionClick={handleTaskActionClick}
      isSheet
    />
  );
};

export default TaskSheet;
