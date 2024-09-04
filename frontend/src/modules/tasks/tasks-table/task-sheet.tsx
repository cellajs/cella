import { useEffect } from 'react';
import { dropdowner } from '~/modules/common/dropdowner/state';
import type { TaskImpact, TaskType } from '~/modules/tasks/create-task-form';
import { TaskCard } from '~/modules/tasks/task';
import { SelectImpact } from '~/modules/tasks/task-selectors/select-impact';
import SetLabels from '~/modules/tasks/task-selectors/select-labels';
import AssignMembers from '~/modules/tasks/task-selectors/select-members';
import SelectStatus, { type TaskStatus } from '~/modules/tasks/task-selectors/select-status';
import { SelectTaskType } from '~/modules/tasks/task-selectors/select-task-type';
import { useThemeStore } from '~/store/theme';
import type { Task } from '~/types';

import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { updateTask } from '~/api/tasks';
import type { TaskQueryActions } from '~/lib/custom-events/types';
import { isSubTaskData } from '~/lib/drag-and-drop';
import { getRelativeTaskOrder } from '~/modules/tasks/helpers';

const TaskSheet = ({
  task,
  tasks,
  callback,
}: {
  task: Task;
  tasks: Task[];
  callback?: (task: Task[], action: TaskQueryActions) => void;
}) => {
  const { t } = useTranslation();
  const { mode } = useThemeStore();
  const handleTaskActionClick = (task: Task, field: string, trigger: HTMLElement) => {
    let component = <SelectTaskType currentType={task.type as TaskType} />;

    if (field === 'impact') component = <SelectImpact value={task.impact as TaskImpact} />;
    else if (field === 'labels') component = <SetLabels value={task.labels} organizationId={task.organizationId} projectId={task.projectId} />;
    else if (field === 'assignedTo') component = <AssignMembers projectId={task.projectId} value={task.assignedTo} />;
    else if (field.includes('status')) component = <SelectStatus taskStatus={task.status as TaskStatus} projectId={task.projectId} />;
    return dropdowner(component, {
      id: field,
      trigger,
      align: field.startsWith('status') || field === 'assignedTo' ? 'end' : 'start',
    });
  };

  useEffect(() => {
    return combine(
      monitorForElements({
        canMonitor({ source }) {
          return isSubTaskData(source.data);
        },
        async onDrop({ location, source }) {
          const target = location.current.dropTargets[0];
          if (!target) return;
          const sourceData = source.data;
          const targetData = target.data;

          const edge: Edge | null = extractClosestEdge(targetData);
          const isSubTask = isSubTaskData(sourceData) && isSubTaskData(targetData);
          if (!edge || !isSubTask) return;
          const newOrder: number = getRelativeTaskOrder(edge, tasks, targetData.order, sourceData.item.id, targetData.item.parentId ?? undefined);
          try {
            const updatedTask = await updateTask(sourceData.item.id, 'order', newOrder);
            callback?.([updatedTask], 'updateSubTask');
          } catch (err) {
            toast.error(t('common:error.reorder_resources', { resources: t('common:todo') }));
          }
        },
      }),
    );
  }, [task]);

  return (
    <TaskCard mode={mode} task={task} isExpanded={true} isSelected={false} isFocused={true} handleTaskActionClick={handleTaskActionClick} isSheet />
  );
};

export default TaskSheet;
