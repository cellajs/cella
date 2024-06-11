import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import type { DropTargetRecord, ElementDragPayload } from '@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { dropTargetForExternal } from '@atlaskit/pragmatic-drag-and-drop/external/adapter';
import { useEffect, useRef, useState } from 'react';
import { getDraggableItemData } from '~/lib/utils';
import type { DraggableItemData } from '~/types';
import { DropIndicator } from '../../common/drop-indicator';
import type { Task } from '../../common/electric/electrify';
import { TaskCard } from './task-card';
import { useTaskContext } from './task-context';
import { useWorkspaceContext } from '~/modules/workspaces/workspace-context';

type TaskDraggableItemData = DraggableItemData<Task> & { type: 'task' };

export const isTaskData = (data: Record<string | symbol, unknown>): data is TaskDraggableItemData => {
  return data.dragItem === true && typeof data.index === 'number' && data.type === 'task';
};

export const DraggableTaskCard = ({ taskIndex }: { taskIndex: number }) => {
  const { task } = useTaskContext(({ task }) => ({ task }));
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
    setIsDraggedOver(true);
    if (!isTaskData(source.data) || !isTaskData(self.data)) return;
    setClosestEdge(extractClosestEdge(self.data));
  };

  // create draggable & dropTarget elements and auto scroll
  useEffect(() => {
    const element = taskDragRef.current;
    const dragButton = taskDragButtonRef.current;
    const data = getDraggableItemData<Task>(task, taskIndex, 'task');
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
