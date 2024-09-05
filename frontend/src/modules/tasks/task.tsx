import { cva } from 'class-variance-authority';
import { ChevronDown, ChevronUp, Tag, UserX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { queryClient } from '~/lib/router';
import { cn } from '~/lib/utils.ts';
import { impacts } from '~/modules/tasks/task-selectors/select-impact.tsx';
import { type TaskStatus, statusVariants, taskStatuses } from '~/modules/tasks/task-selectors/select-status.tsx';
import { taskTypes } from '~/modules/tasks/task-selectors/select-task-type.tsx';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';

import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AvatarWrap } from '~/modules/common/avatar-wrap.tsx';
import { NotSelected } from '~/modules/tasks/task-selectors/impact-icons/not-selected.tsx';
import { AvatarGroup, AvatarGroupList, AvatarOverflowIndicator } from '~/modules/ui/avatar';

import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import type { DropTargetRecord, ElementDragPayload } from '@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { dropTargetForExternal } from '@atlaskit/pragmatic-drag-and-drop/external/adapter';
import { useLocation } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { updateTask } from '~/api/tasks.ts';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { getDraggableItemData, isTaskData } from '~/lib/drag-and-drop';
import { DropIndicator } from '~/modules/common/drop-indicator';
import { type DropDownToRemove, dropdownerState } from '~/modules/common/dropdowner/state';
import { getNewStatusTaskOrder } from '~/modules/tasks/helpers';
import TaskDescription from '~/modules/tasks/task-content.tsx';
import { Badge } from '~/modules/ui/badge.tsx';
import { Checkbox } from '~/modules/ui/checkbox.tsx';
import type { Mode } from '~/store/theme.ts';
import type { Task } from '~/types';

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
  style?: React.CSSProperties;
  task: Task;
  mode: Mode;
  isExpanded: boolean;
  isSelected: boolean;
  isFocused: boolean;
  handleTaskActionClick: (task: Task, field: string, trigger: HTMLElement) => void;
  tasks?: Task[];
  isSheet?: boolean;
}

export function TaskCard({ style, task, tasks, mode, isSelected, isFocused, isExpanded, isSheet, handleTaskActionClick }: TaskProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const taskRef = useRef<HTMLDivElement>(null);
  const taskDragRef = useRef<HTMLDivElement>(null);
  const isMobile = useBreakpoints('max', 'sm');

  const [dragging, setDragging] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

  const selectedImpact = task.impact !== null ? impacts[task.impact] : null;

  const updateStatus = async (newStatus: number) => {
    try {
      const query = queryClient.getQueryData(['boardTasks', task.projectId]) as { items: Task[] };
      const newOrder = getNewStatusTaskOrder(task.status, newStatus, isSheet ? tasks ?? [] : query.items ?? []);
      const updatedTask = await updateTask(task.id, 'status', newStatus, newOrder);
      const eventName = pathname.includes('/board') ? 'taskCRUD' : 'taskTableCRUD';
      dispatchCustomEvent(eventName, { array: [updatedTask], action: 'update' });
    } catch (err) {
      toast.error(t('common:error.update_resource', { resource: t('common:task') }));
    }
  };

  const dragEnd = () => {
    setClosestEdge(null);
    setDragOver(false);
  };

  const isDragOver = ({ self, source }: { source: ElementDragPayload; self: DropTargetRecord }) => {
    setDragOver(true);
    if (!isTaskData(source.data) || !isTaskData(self.data)) return;
    setClosestEdge(extractClosestEdge(self.data));
  };

  const handleCardClick = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    const target = event.target as HTMLElement;
    if (isExpanded && isFocused) return;
    dispatchCustomEvent('taskCardClick', { taskId: task.id, clickTarget: target });
  };

  useEffect(() => {
    const unsubscribe = dropdownerState.subscribe((dropdowner) => {
      if (dropdowner.id === `status-${task.id}`) setIsStatusDropdownOpen(!(dropdowner as DropDownToRemove).remove);
    });

    return () => {
      unsubscribe();
    };
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
  }, [task]);

  return (
    <motion.div layout transition={{ duration: 0.3 }}>
      <Card
        id={task.id}
        onClick={handleCardClick}
        style={style}
        tabIndex={0}
        ref={taskRef}
        className={cn(
          `group/task relative rounded-none border-0 border-b bg-transparent hover:bg-card/20 bg-gradient-to-br from-transparent focus:outline-none 
        focus-visible:none border-l-2 via-transparent via-60% to-100% opacity-${dragging ? '30' : '100'} 
        ${dragOver ? 'bg-card/20' : ''} 
        ${isFocused && !isSheet ? 'border-l-primary is-focused' : 'border-l-transparent'}
        ${isExpanded ? 'is-expanded' : 'is-collapsed'}`,
          variants({
            status: task.status as TaskStatus,
          }),
        )}
      >
        <CardContent id={`${task.id}-content`} ref={taskDragRef} className="pl-1.5 pt-1 pb-2 sm: pr-1 pr-2 space-between flex flex-col relative">
          {/* To prevent on expand animation */}
          <motion.div className="flex flex-col gap-1" layout transition={{ duration: 0 }}>
            <div className="flex gap-1 w-full">
              <div className="flex flex-col gap-1">
                <Button
                  id="type"
                  onClick={(event) => handleTaskActionClick(task, 'type', event.currentTarget)}
                  aria-label="Set type"
                  variant="ghost"
                  size="xs"
                  className="relative group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-80"
                >
                  {taskTypes[taskTypes.findIndex((t) => t.value === task.type)]?.icon() || ''}
                </Button>
                {isExpanded && !isSheet && (
                  <Button
                    onClick={() => dispatchCustomEvent('toggleCard', task.id)}
                    aria-label="Collapse"
                    variant="ghost"
                    size="xs"
                    className="relative group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-80"
                  >
                    <ChevronUp size={16} />
                  </Button>
                )}
              </div>
              <div className="flex flex-col grow gap-2">
                <TaskDescription mode={mode} task={task} isExpanded={isExpanded} />
              </div>
            </div>
            <div className="flex flex-col sm: gap-1 gap-2">
              <div className="flex items-end justify-between gap-1">
                {!isSheet && (
                  <Checkbox
                    className="group-hover/task:opacity-100 mb-1.5 border-foreground/40 data-[state=checked]:border-primary ml-1.5 group-[.is-focused]/task:opacity-100 opacity-80"
                    checked={isSelected}
                    onCheckedChange={(checked) => dispatchCustomEvent('toggleSelectTask', { selected: !!checked, taskId: task.id })}
                  />
                )}
                {task.type !== 'bug' && (
                  <Button
                    id="impact"
                    onClick={(event) => handleTaskActionClick(task, 'impact', event.currentTarget)}
                    aria-label="Set impact"
                    variant="ghost"
                    size="xs"
                    className="relative group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-80"
                  >
                    {selectedImpact === null ? (
                      <NotSelected className="size-4 fill-current" aria-hidden="true" />
                    ) : (
                      <selectedImpact.icon className="size-4 fill-current" aria-hidden="true" />
                    )}
                  </Button>
                )}

                <Button
                  id="labels"
                  onClick={(event) => handleTaskActionClick(task, 'labels', event.currentTarget)}
                  aria-label="Set labels"
                  variant="ghost"
                  size="xs"
                  className="relative flex h-auto justify-start font-light sm: px-0.5 py-0.5 min-h-8 min-w-8 group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-80"
                >
                  <div className="flex truncate flex-wrap gap-[.07rem]">
                    {task.labels.length > 0 ? (
                      isMobile ? (
                        <div className="inline-flex gap-0.5 items-center">
                          <Badge
                            variant="outline"
                            key={task.labels[0].id}
                            className="inline-block border-0 px-0 truncate font-xs text-[.75rem] h-5 bg-transparent last:mr-0 leading-4"
                          >
                            {task.labels[0].name}
                          </Badge>
                          <Badge className="p-1 min-w-5 min-h-5 flex bg-accent justify-center">+{task.labels.length - 1}</Badge>
                        </div>
                      ) : (
                        task.labels.map(({ name, id }) => {
                          return (
                            <div
                              key={id}
                              className="flex flex-wrap max-w-24 align-center justify-center items-center rounded-full border px-0 bg-border"
                            >
                              <Badge
                                variant="outline"
                                key={id}
                                className="inline-block border-0 max-w-32 truncate font-normal text-[.75rem] h-5 bg-transparent last:mr-0 leading-4"
                              >
                                {name}
                              </Badge>
                            </div>
                          );
                        })
                      )
                    ) : (
                      <Tag size={16} className="opacity-60" />
                    )}
                  </div>
                </Button>
                <div className="flex gap-1 ml-auto mr-1">
                  <Button
                    id="assignedTo"
                    onClick={(event) => handleTaskActionClick(task, 'assignedTo', event.currentTarget)}
                    aria-label="Assign"
                    variant="ghost"
                    size="xs"
                    className="relative flex justify-start gap-2 group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-80"
                  >
                    {task.assignedTo.length > 0 ? (
                      <AvatarGroup limit={isMobile ? 1 : 3}>
                        <AvatarGroupList>
                          {task.assignedTo.map((user) => (
                            <AvatarWrap type="user" key={user.id} id={user.id} name={user.name} url={user.thumbnailUrl} className="h-6 w-6 text-xs" />
                          ))}
                        </AvatarGroupList>
                        <AvatarOverflowIndicator className="h-6 w-6 text-xs" />
                      </AvatarGroup>
                    ) : (
                      <UserX className="h-4 w-4 opacity-60" />
                    )}
                  </Button>

                  <Button
                    id={`status-${task.id}`}
                    onClick={() => updateStatus(task.status + 1)}
                    disabled={(task.status as TaskStatus) === 6}
                    variant="outlineGhost"
                    size="xs"
                    className={cn(
                      'relative border-r-0 rounded-r-none font-normal [&:not(.absolute)]:active:translate-y-0 disabled:opacity-100 mr-1',
                      statusVariants({ status: task.status as TaskStatus }),
                    )}
                  >
                    {t(taskStatuses[task.status as TaskStatus].action)}
                  </Button>
                  <Button
                    onClick={(event) => handleTaskActionClick(task, `status-${task.id}`, event.currentTarget)}
                    aria-label="Set status"
                    variant="outlineGhost"
                    size="xs"
                    className={cn(
                      'relative rounded-none rounded-r -ml-2 [&:not(.absolute)]:active:translate-y-0',
                      statusVariants({ status: task.status as TaskStatus }),
                    )}
                  >
                    <ChevronDown size={12} className={`transition-transform ${isStatusDropdownOpen ? 'rotate-180' : 'rotate-0'}`} />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </CardContent>
        {closestEdge && <DropIndicator className="h-0.5" edge={closestEdge} gap={0.2} />}
      </Card>
    </motion.div>
  );
}
