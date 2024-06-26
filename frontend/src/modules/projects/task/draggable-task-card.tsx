import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import type { DropTargetRecord, ElementDragPayload } from '@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { dropTargetForExternal } from '@atlaskit/pragmatic-drag-and-drop/external/adapter';
import { useEffect, useRef, useState } from 'react';
import { getDraggableItemData } from '~/lib/utils';
import { useWorkspaceContext } from '~/modules/workspaces/workspace-context';
import type { DraggableItemData } from '~/types';
import { DropIndicator } from '../../common/drop-indicator';
import type { Task } from '../../common/electric/electrify';
import { TaskCard } from './task-card';
import { useTaskContext } from './task-context';
import { useProjectContext } from '../board/project-context';

type TaskDraggableItemData = DraggableItemData<Task> & { type: 'task' };

export const isTaskData = (data: Record<string | symbol, unknown>): data is TaskDraggableItemData => {
  return data.dragItem === true && typeof data.order === 'number' && data.type === 'task' && typeof data.index === 'number';
};

export const DraggableTaskCard = () => {
  const { task, taskIndex } = useTaskContext(({ task, taskIndex }) => ({ task, taskIndex }));
  const { labels, tasks, members } = useProjectContext(({ labels, tasks, members }) => ({ labels, tasks, members }));
  const { focusedTaskId } = useWorkspaceContext(({ focusedTaskId }) => ({ focusedTaskId }));
  const taskDragRef = useRef(null);
  const taskDragButtonRef = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState(false);
  const [isDraggedOver, setIsDraggedOver] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  const dragIsOn = () => {
    setClosestEdge(null);
    setIsDraggedOver(false);
  };

  const dragIsOver = ({ self, source }: { source: ElementDragPayload; self: DropTargetRecord }) => {
    const edge = extractClosestEdge(self.data);
    setIsDraggedOver(true);
    if (!isTaskData(source.data) || !isTaskData(self.data)) return;
    if (edge === 'bottom' && source.data.index - 1 === self.data.index) return setClosestEdge('top');
    if (edge === 'top' && source.data.index + 1 === self.data.index) return setClosestEdge('bottom');
    setClosestEdge(edge);
  };

  // create draggable & dropTarget elements and auto scroll
  useEffect(() => {
    const element = taskDragRef.current;
    const dragButton = taskDragButtonRef.current;
    const data = getDraggableItemData<Task>(task, task.sort_order, 'task', 'PROJECT', taskIndex);
    if (!element || !dragButton) return;

    return combine(
      draggable({
        element,
        dragHandle: dragButton,
        getInitialData: () => data,
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForExternal({
        element: element,
      }),
      dropTargetForElements({
        element,
        canDrop({ source }) {
          const data = source.data;
          return isTaskData(data) && data.item.id !== task.id && data.item.status === task.status && data.type === 'task';
        },
        getIsSticky: () => true,
        getData({ input }) {
          return attachClosestEdge(data, {
            element,
            input,
            allowedEdges: ['top', 'bottom'],
          });
        },
        onDragEnter: ({ self, source }) => dragIsOver({ self, source }),
        onDrag: ({ self, source }) => dragIsOver({ self, source }),
        onDragLeave: () => dragIsOn(),
        onDrop: () => dragIsOn(),
      }),
    );
  }, [task]);

  return (
    <div className="relative">
      <TaskCard
        task={task}
        labels={labels}
        members={members}
        subTasks={tasks.filter((t) => t.parent_id === task.id)}
        taskRef={taskDragRef}
        taskDragButtonRef={taskDragButtonRef}
        dragging={dragging}
        dragOver={isDraggedOver}
        className={`relative border-l-2 ${focusedTaskId === task.id ? 'border-l-primary is-focused' : 'border-l-transparent'}`}
      />

      {closestEdge && <DropIndicator className="h-[2px]" edge={closestEdge} gap="-2px" />}
    </div>
  );
};
