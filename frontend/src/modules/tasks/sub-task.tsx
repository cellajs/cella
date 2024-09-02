import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import type { DropTargetRecord, ElementDragPayload } from '@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { dropTargetForExternal } from '@atlaskit/pragmatic-drag-and-drop/external/adapter';
import { useLocation } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import { ChevronUp, Trash } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { deleteTasks, updateTask } from '~/api/tasks';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { getDraggableItemData, isSubTaskData } from '~/lib/drag-and-drop';
import { cn } from '~/lib/utils';
import { DropIndicator } from '~/modules/common/drop-indicator';
import { TaskBlockNote } from '~/modules/tasks/task-selectors/task-blocknote';
import { Button } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import type { Mode } from '~/store/theme';
import type { SubTask as BaseSubTask } from '~/types';

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
  const [isEditing, setIsEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  const onRemove = (subTaskId: string) => {
    deleteTasks([subTaskId]).then((resp) => {
      const eventName = pathname.includes('/board') ? 'taskCRUD' : 'taskTableCRUD';
      dispatchCustomEvent(eventName, { array: [{ id: subTaskId }], action: 'deleteSubTask' });
      if (resp) toast.success(t('common:success.delete_resources', { resources: t('common:todos') }));
      else toast.error(t('common:error.delete_resources', { resources: t('common:todos') }));
    });
  };

  const setEdge = ({ self, source }: { source: ElementDragPayload; self: DropTargetRecord }) => {
    if (!isSubTaskData(source.data) || !isSubTaskData(self.data)) return;
    setClosestEdge(extractClosestEdge(self.data));
  };

  const handleUpdateStatus = async (newStatus: number) => {
    try {
      const updatedTask = await updateTask(task.id, 'status', newStatus);
      const eventName = pathname.includes('/board') ? 'taskCRUD' : 'taskTableCRUD';
      dispatchCustomEvent(eventName, { array: [updatedTask], action: 'updateSubTask' });
    } catch (err) {
      toast.error(t('common:error.update_resource', { resource: t('common:todo') }));
    }
  };

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
        className={`relative flex items-start gap-1 p-1 border-b-2 hover:bg-secondary/80 border-background opacity-${dragging ? '30' : '100'} bg-secondary/50`}
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

          {isEditing && task.expandable && (
            <Button onClick={() => setIsEditing(false)} aria-label="Collapse" variant="ghost" size="xs" className="bg-secondary/80">
              <ChevronUp size={16} />
            </Button>
          )}
        </div>
        <div className="flex flex-col grow min-h-7 justify-center gap-2 mx-1">
          <div className={!isEditing ? 'inline-flex items-center mt-1' : 'flex flex-col items-start mt-1'}>
            {isEditing ? (
              <TaskBlockNote
                id={task.id}
                projectId={task.projectId}
                html={task.description || ''}
                mode={mode}
                className="w-full bg-transparent border-none"
                subTask
              />
            ) : (
              // biome-ignore lint/security/noDangerouslySetInnerHtml: is sanitized by backend
              // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
              <div onClick={() => setIsEditing(true)} dangerouslySetInnerHTML={{ __html: task.summary as string }} className="mr-1.5" />
            )}

            {task.expandable && !isEditing && (
              <Button onClick={() => setIsEditing(true)} variant="link" size="micro" className="py-0">
                {t('common:more').toLowerCase()}
              </Button>
            )}
          </div>
        </div>
        <Button onClick={() => onRemove(task.id)} variant="ghost" size="xs" className="text-secondary-foreground cursor-pointer opacity-30">
          <span className="sr-only">{t('common:move_task')}</span>
          <Trash size={16} />
        </Button>
        {closestEdge && <DropIndicator className="h-0.5" edge={closestEdge} gap={0.2} />}
      </motion.div>
    </motion.div>
  );
};

export default SubTask;
