import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { isSubtaskData } from '~/modules/app/board/helpers';
import { useTaskUpdateMutation } from '~/modules/common/query-client-provider/tasks';
import { getRelativeTaskOrder, handleTaskDropDownClick, setTaskCardFocus } from '~/modules/tasks/helpers';
import TaskCard from '~/modules/tasks/task';
import { useWorkspaceQuery } from '~/modules/workspaces/helpers/use-workspace';
import { useThemeStore } from '~/store/theme';
import type { Task } from '~/types/app';
import { dropdowner } from '../common/dropdowner/state';

interface TasksSheetProps {
  task: Task;
}

const TaskSheet = ({ task }: TasksSheetProps) => {
  console.log('🚀 ~ TaskSheet ~ task:', task);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mode } = useThemeStore();
  const taskMutation = useTaskUpdateMutation();
  const {
    data: { workspace },
  } = useWorkspaceQuery();

  // Open on key press
  const hotKeyPress = (field: string) => {
    const taskCard = document.getElementById(`sheet-card-${task.id}`);
    if (!taskCard) return;
    if (taskCard && document.activeElement !== taskCard) taskCard.focus();
    const trigger = taskCard.querySelector(`#${field}`);
    if (!trigger) return dropdowner.remove();
    handleTaskDropDownClick(task, field, trigger as HTMLElement);
  };

  console.log(231);
  useHotkeys([
    ['A', () => hotKeyPress(`assignedTo-${task.id}`)],
    ['I', () => hotKeyPress(`impact-${task.id}`)],
    ['L', () => hotKeyPress(`labels-${task.id}`)],
    ['S', () => hotKeyPress(`status-${task.id}`)],
    ['T', () => hotKeyPress(`type-${task.id}`)],
  ]);

  useEffect(() => {
    setTaskCardFocus(`sheet-card-${task.id}`);
    // Add search parameter on mount
    navigate({
      to: '.',
      replace: true,
      resetScroll: false,
      search: (prev) => ({
        ...prev,
        taskIdPreview: task.id,
      }),
    });

    // Cleanup function to remove search parameter on unmount
    return () => {
      navigate({
        to: '.',
        replace: true,
        resetScroll: false,
        search: (prev) => {
          const { taskIdPreview, ...rest } = prev;
          return rest;
        },
      });
    };
  }, []);

  useEffect(() => {
    return combine(
      monitorForElements({
        canMonitor({ source }) {
          return isSubtaskData(source.data);
        },
        async onDrop({ location, source }) {
          const target = location.current.dropTargets[0];
          if (!target) return;
          const sourceData = source.data;
          const targetData = target.data;

          const edge: Edge | null = extractClosestEdge(targetData);
          const isSubtask = isSubtaskData(sourceData) && isSubtaskData(targetData);
          if (!edge || !isSubtask) return;
          const newOrder: number = getRelativeTaskOrder(edge, [], targetData.order, sourceData.item.id, targetData.item.parentId ?? undefined);
          try {
            await taskMutation.mutateAsync({
              id: sourceData.item.id,
              orgIdOrSlug: workspace.organizationId,
              key: 'order',
              data: newOrder,
              projectId: sourceData.item.projectId,
            });
          } catch (err) {
            toast.error(t('common:error.reorder_resource', { resource: t('app:todo') }));
          }
        },
      }),
    );
  }, [task]);

  return <TaskCard mode={mode} task={task} state="editing" isSelected={false} isFocused={true} isSheet />;
};

export default TaskSheet;
