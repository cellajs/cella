import { useEffect } from 'react';
import { TaskCard } from '~/modules/tasks/task';
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

interface TaskSheetProps {
  task: Task;
  tasks: Task[];
  callback?: (task: Task[], action: TaskQueryActions) => void;
}

const TaskSheet = ({ task, tasks, callback }: TaskSheetProps) => {
  const { t } = useTranslation();
  const { mode } = useThemeStore();
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

  return <TaskCard mode={mode} task={task} tasks={tasks} isExpanded={true} isSelected={false} isFocused={true} isSheet />;
};

export default TaskSheet;
