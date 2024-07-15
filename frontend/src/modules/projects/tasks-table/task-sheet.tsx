import { toast } from 'sonner';
import { enhanceTasks } from '~/hooks/use-filtered-task-helpers.ts';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { type Task, useElectric } from '~/modules/common/electric/electrify';
import { sheet } from '~/modules/common/sheeter/state.ts';
import type { TaskImpact, TaskType } from '../task/create-task-form';
import { getTaskOrder } from '../task/helpers';
import { TaskCard } from '../task/task-card.tsx';
import { SelectImpact } from '../task/task-selectors/select-impact';
import SetLabels from '../task/task-selectors/select-labels';
import AssignMembers from '../task/task-selectors/select-members';
import SelectStatus, { type TaskStatus } from '../task/task-selectors/select-status';
import { SelectTaskType } from '../task/task-selectors/select-task-type';
import { useWorkspaceStore } from '~/store/workspace.ts';
import { useThemeStore } from '~/store/theme';
import { useUserStore } from '~/store/user.ts';
import { useTranslation } from 'react-i18next';

const TaskSheet = ({ task, tasks }: { task: Task; tasks: Task[] }) => {
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const electric = useElectric()!;
  const { t } = useTranslation();
  const { mode } = useThemeStore();
  const user = useUserStore((state) => state.user);

  const { members, labels } = useWorkspaceStore(({ members, labels }) => ({
    members,
    labels,
  }));

  const handleChange = (field: keyof Task, value: string | number | null, taskId: string) => {
    if (!electric) return toast.error(t('common:local_db_inoperable'));
    const db = electric.db;
    const newOrder = field === 'status' ? getTaskOrder(taskId, value, tasks) : null;
    db.tasks
      .update({
        data: {
          [field]: value,
          ...(newOrder && { sort_order: newOrder }),
          modified_at: new Date(),
          modified_by: user.id,
        },
        where: {
          id: taskId,
        },
      })
      .then((updatedTask) => taskUpdateCallback(updatedTask as Task))
      .catch((error) => {
        console.error('Error:', error);
      });
  };

  const taskUpdateCallback = (updatedTask: Task) => {
    const [task] = enhanceTasks([updatedTask], labels, members);
    sheet.update(`task-card-preview-${task.id}`, {
      content: (
        <TaskCard
          mode={mode}
          task={task}
          isExpanded={true}
          isSelected={false}
          isFocused={true}
          handleTaskChange={handleChange}
          handleTaskActionClick={handleTaskActionClick}
        />
      ),
    });
  };

  const handleTaskActionClick = (task: Task, field: string, trigger: HTMLElement) => {
    let component = <SelectTaskType currentType={task.type as TaskType} changeTaskType={(newType) => handleChange('type', newType, task.id)} />;

    if (field === 'impact')
      component = <SelectImpact value={task.impact as TaskImpact} changeTaskImpact={(newImpact) => handleChange('impact', newImpact, task.id)} />;
    else if (field === 'labels')
      component = (
        <SetLabels
          value={task.virtualLabels}
          organizationId={task.organization_id}
          projectId={task.project_id}
          taskUpdateCallback={taskUpdateCallback}
        />
      );
    else if (field === 'assigned_to')
      component = <AssignMembers projectId={task.project_id} value={task.virtualAssignedTo} taskUpdateCallback={taskUpdateCallback} />;
    else if (field === 'status')
      component = (
        <SelectStatus taskStatus={task.status as TaskStatus} changeTaskStatus={(newStatus) => handleChange('status', newStatus, task.id)} />
      );

    return dropdowner(component, { id: field, trigger, align: ['status', 'assigned_to'].includes(field) ? 'end' : 'start' });
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
    />
  );
};

export default TaskSheet;
