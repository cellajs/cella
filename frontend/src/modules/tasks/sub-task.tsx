import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import type { DropTargetRecord, ElementDragPayload } from '@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { dropTargetForExternal } from '@atlaskit/pragmatic-drag-and-drop/external/adapter';
import { useLocation } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { deleteTasks, updateTask } from '~/api/tasks';
import { useEventListener } from '~/hooks/use-event-listener';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { getDraggableItemData } from '~/lib/drag-drop';
import { cn } from '~/lib/utils';
import { DropIndicator } from '~/modules/common/drop-indicator';
import { TaskHeader } from '~/modules/tasks/task-header';
import { TaskBlockNote } from '~/modules/tasks/task-selectors/task-blocknote';
import { Button } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import type { Mode } from '~/store/theme';
import type { SubTask as BaseSubTask, Task } from '~/types/app';
import { isSubTaskData } from '../projects/board/board';

const SubTask = ({
  task,
  mode,
}: {
  task: BaseSubTask;
  mode: Mode;
}) => {
  const { t } = useTranslation();

  const { pathname } = useLocation();
  const subTaskRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  const onRemove = (subTaskId: string) => {
    deleteTasks([subTaskId]).then((resp) => {
      const eventName = pathname.includes('/board') ? 'taskOperation' : 'taskTableOperation';
      dispatchCustomEvent(eventName, { array: [{ id: subTaskId }], action: 'deleteSubTask', projectId: task.projectId });
      if (resp) toast.success(t('common:success.delete_resources', { resources: t('app:todos') }));
      else toast.error(t('common:error.delete_resources', { resources: t('app:todos') }));
    });
  };

  const setEdge = ({ self, source }: { source: ElementDragPayload; self: DropTargetRecord }) => {
    if (!isSubTaskData(source.data) || !isSubTaskData(self.data)) return;
    setClosestEdge(extractClosestEdge(self.data));
  };

  const handleUpdateStatus = async (newStatus: number) => {
    try {
      const updatedTask = await updateTask(task.id, 'status', newStatus);
      const eventName = pathname.includes('/board') ? 'taskOperation' : 'taskTableOperation';
      dispatchCustomEvent(eventName, { array: [updatedTask], action: 'updateSubTask', projectId: task.projectId });
    } catch (err) {
      toast.error(t('common:error.update_resource', { resource: t('app:todo') }));
    }
  };

  useEventListener('toggleSubTaskEditing', (e) => {
    const { id, state } = e.detail;
    // Update the sub-task editing state based on the event id:
    // - matches the task's parentId
    // - doesn't match both the task's parentId and task id
    if (task.parentId === id || (task.parentId !== id && task.id !== id)) {
      setIsEditing(state);
    }
  });

  // create draggable & dropTarget elements and auto scroll
  useEffect(() => {
    const data = getDraggableItemData<BaseSubTask>(task, task.order, 'subTask', 'project');
    const element = subTaskRef.current;
    if (!element) return;

    return combine(
      draggable({
        element,
        dragHandle: element,
        getInitialData: () => data,
        onDragStart: () => setDragging(true),
        canDrag: () => !isEditing,
        onDrop: () => setDragging(false),
      }),
      dropTargetForExternal({
        element,
      }),
      dropTargetForElements({
        element,
        canDrop({ source }) {
          const data = source.data;
          return isSubTaskData(data) && data.item.id !== task.id;
        },
        getIsSticky: () => true,

        getData({ input }) {
          return attachClosestEdge(data, {
            element,
            input,
            allowedEdges: ['top', 'bottom'],
          });
        },
        onDragEnter: ({ self, source }) => setEdge({ self, source }),
        onDrag: ({ self, source }) => setEdge({ self, source }),
        onDragLeave: () => setClosestEdge(null),
        onDrop: () => setClosestEdge(null),
      }),
    );
  }, [task]);

  return (
    <motion.div layout>
      {/* To prevent on expand animation */}
      <motion.div
        layout
        transition={{ duration: 0 }}
        ref={subTaskRef}
        className={`relative flex items-start gap-1 p-1 mb-0.5 hover:bg-secondary/50 opacity-${dragging ? '30' : '100'} bg-secondary/40`}
      >
        <div className="flex flex-col gap-1">
          <Checkbox
            className={cn(
              'group-[.is-selected]/column:opacity-100 group-[.is-selected]/column:z-30 group-[.is-selected]/column:pointer-events-auto',
              'transition-all bg-background w-5 h-5 m-1.5',
              `${task.status === 6 ? 'data-[state=checked]:bg-green-700 !text-white border-green-700' : 'border-gray-500'}`,
            )}
            checked={task.status === 6}
            onCheckedChange={async (checkStatus) => await handleUpdateStatus(checkStatus ? 6 : 1)}
          />
        </div>
        <div
          onClick={() => {
            if (!isExpanded) setIsExpanded(true);
          }}
          onKeyDown={() => {}}
          className="flex flex-col grow min-h-7 justify-center gap-2 mx-1"
        >
          <div className={!isExpanded ? 'inline-flex items-center mt-1' : 'mt-1 flex flex-col items-start'}>
            {!isExpanded ? (
              // biome-ignore lint/security/noDangerouslySetInnerHtml: is sanitized by backend
              <div dangerouslySetInnerHTML={{ __html: task.summary as string }} className="mr-1.5" />
            ) : (
              <>
                {isEditing ? (
                  <TaskBlockNote
                    id={task.id}
                    projectId={task.projectId}
                    html={task.description || ''}
                    mode={mode}
                    className="w-full pr-2 bg-transparent border-none"
                    subTask
                    taskToClose={task.parentId}
                  />
                ) : (
                  <div className={'w-full bg-transparent pr-2 border-none bn-container bn-shadcn'} data-color-scheme={mode}>
                    <div
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: is sanitized by backend
                      dangerouslySetInnerHTML={{ __html: task.description }}
                      onClick={() => setIsEditing(true)}
                      onKeyDown={() => {}}
                    />
                  </div>
                )}
                <TaskHeader
                  task={task as Task}
                  isEditing={isEditing}
                  onRemove={onRemove}
                  changeEditingState={(state) => setIsEditing(state)}
                  closeExpand={() => setIsExpanded(false)}
                />
              </>
            )}

            {task.expandable && !isExpanded && (
              <Button onClick={() => setIsExpanded(true)} variant="link" size="micro" className="py-0 -mt-[0.15rem]">
                {t('common:more').toLowerCase()}
              </Button>
            )}
          </div>
        </div>
        {closestEdge && <DropIndicator className="h-0.5" edge={closestEdge} gap={0.2} />}
      </motion.div>
    </motion.div>
  );
};

export default SubTask;
