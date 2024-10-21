import { cva } from 'class-variance-authority';
import { memo, useEffect, useRef, useState } from 'react';

import { Card, CardContent } from '~/modules/ui/card';
import { cn } from '~/utils/cn';

import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import type { DropTargetRecord, ElementDragPayload } from '@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { dropTargetForExternal } from '@atlaskit/pragmatic-drag-and-drop/external/adapter';
import useDoubleClick from '~/hooks/use-double-click';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { isTaskData } from '~/modules/app/board/helpers';
import { DropIndicator } from '~/modules/common/drop-indicator';
import { type DropDownToRemove, dropdownerState } from '~/modules/common/dropdowner/state';
import { handleTaskDropDownClick, setTaskCardFocus } from '~/modules/tasks/helpers';
import TaskDescription from '~/modules/tasks/task-content.tsx';
import type { TaskStatus } from '~/modules/tasks/task-dropdowns/select-status';
import { taskTypes } from '~/modules/tasks/task-dropdowns/select-task-type';
import { TaskFooter } from '~/modules/tasks/task-footer';
import { TaskHeader } from '~/modules/tasks/task-header';
import { Button } from '~/modules/ui/button';
import type { Mode } from '~/store/theme.ts';
import type { Task } from '~/types/app';
import { getDraggableItemData } from '~/utils/drag-drop';
import type { TaskStates } from './types';

const variants = cva('task-card', {
  variants: {
    dragging: {
      over: 'ring-2 opacity-30',
      overlay: 'ring-2 ring-primary',
    },
    status: {
      0: 'to-sky-500/10 border-b-sky-500/20',
      1: '',
      2: 'to-slate-500/10 border-b-slate-500/20',
      3: 'to-lime-500/10 border-b-lime-500/20',
      4: 'to-yellow-500/10 border-b-yellow-500/20',
      5: 'to-orange-500/10 border-b-orange-500/20',
      6: 'to-green-500/10 border-b-green-500/20',
    },
  },
});

interface TaskProps {
  task: Task;
  mode: Mode;
  state: TaskStates;
  isSelected: boolean;
  isFocused: boolean;
  isSheet?: boolean;
  style?: React.CSSProperties;
}

function areEqual(prevProps: TaskProps, nextProps: TaskProps) {
  // Compare to decide if component should rerender
  return (
    prevProps.task === nextProps.task &&
    prevProps.mode === nextProps.mode &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isFocused === nextProps.isFocused &&
    prevProps.state === nextProps.state &&
    prevProps.isSheet === nextProps.isSheet
  );
}

const TaskCard = memo(function TaskCard({ style, task, mode, isSelected, isFocused, state, isSheet }: TaskProps) {
  const taskRef = useRef<HTMLDivElement>(null);
  const taskDragRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

  const dragEnd = () => {
    setClosestEdge(null);
    setDragOver(false);
  };

  const isDragOver = ({ self, source }: { source: ElementDragPayload; self: DropTargetRecord }) => {
    setDragOver(true);
    if (!isTaskData(source.data) || !isTaskData(self.data)) return;
    setClosestEdge(extractClosestEdge(self.data));
  };

  const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isSheet) return;

    if (!isFocused) setTaskCardFocus(task.id);
    const clickTarget = event.target as HTMLElement;
    if (state !== 'folded' || clickTarget.tagName === 'BUTTON' || clickTarget.closest('button')) return;
    dispatchCustomEvent('changeTaskState', { taskId: task.id, state: 'expanded' });
  };

  useDoubleClick({
    onDoubleClick: () => {
      if (state === 'editing' || state === 'unsaved') return;
      dispatchCustomEvent('changeTaskState', { taskId: task.id, state: 'editing', sheet: isSheet });
    },
    allowedTargets: ['p', 'div', 'img'],
    excludeIds: [`subtask-container-${task.id}`],
    ref: taskRef,
  });

  useEffect(() => {
    const unsubscribe = dropdownerState.subscribe((dropdowner) => {
      if (dropdowner.id === `status-${task.id}`) setIsStatusDropdownOpen(!(dropdowner as DropDownToRemove).remove);
    });
    return () => unsubscribe();
  }, [dropdownerState]);

  // create draggable & dropTarget elements and auto scroll
  useEffect(() => {
    const element = taskRef.current;
    const dragElement = taskDragRef.current;
    const data = getDraggableItemData<Task>(task, task.order, 'task', 'project');
    if (!element || !dragElement) return;

    return combine(
      draggable({
        element,
        dragHandle: dragElement,
        getInitialData: () => data,
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
        canDrag: () => {
          if (!taskDragRef.current) return false;
          // Check if there are any sub taskEditing in current task
          const subtasksEditing = taskDragRef.current.querySelectorAll(`[id^="blocknote-subtask-"]`);

          return state === 'folded' || (state === 'expanded' && !subtasksEditing.length);
        },
      }),
      dropTargetForExternal({
        element,
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
        onDragEnter: ({ self, source }) => isDragOver({ self, source }),
        onDrag: ({ self, source }) => isDragOver({ self, source }),
        onDragLeave: () => dragEnd(),
        onDrop: () => dragEnd(),
      }),
    );
  }, [task, state]);

  return (
    <Card
      id={isSheet ? `sheet-card-${task.id}` : task.id}
      onClick={handleCardClick}
      style={style}
      tabIndex={0}
      ref={taskRef}
      className={cn(
        `group/task relative rounded-none border-0 border-b bg-transparent hover:bg-card/20 bg-gradient-to-br from-transparent focus:outline-none 
        focus-visible:none border-l-2 via-transparent via-60% to-100% opacity-${dragging ? '30' : '100'} 
        ${dragOver ? 'bg-card/20' : ''} 
        ${isFocused && !isSheet ? 'border-l-primary is-focused' : 'border-l-transparent'}
        ${state !== 'folded' ? 'is-expanded' : 'is-collapsed'}`,
        variants({
          status: task.status as TaskStatus,
        }),
      )}
    >
      <CardContent id={`${task.id}-content`} ref={taskDragRef} className="p-2 sm:pr-3 space-between flex flex-col relative">
        {state !== 'folded' && <TaskHeader task={task} state={state} isSheet={isSheet} />}
        <div className="flex flex-row gap-1 w-full">
          {state === 'folded' && (
            <Button
              id={`type-${task.id}`}
              onClick={(event) => handleTaskDropDownClick(task, 'type', event.currentTarget)}
              aria-label="Set type"
              variant="ghost"
              size="xs"
              className="relative group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-80 -ml-0.5"
            >
              {taskTypes[taskTypes.findIndex((t) => t.value === task.type)]?.icon() || ''}
            </Button>
          )}
          <TaskDescription mode={mode} task={task} state={state} isSheet={isSheet} />
        </div>
        <TaskFooter task={task} isSheet={isSheet} isSelected={isSelected} isStatusDropdownOpen={isStatusDropdownOpen} />
      </CardContent>
      {closestEdge && <DropIndicator className="h-0.5" edge={closestEdge} gap={0.2} />}
    </Card>
  );
}, areEqual);

export default TaskCard;
