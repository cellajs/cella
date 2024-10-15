import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import type { DropTargetRecord, ElementDragPayload } from '@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { dropTargetForExternal } from '@atlaskit/pragmatic-drag-and-drop/external/adapter';
import { config } from 'config';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { deleteTasks } from '~/api/tasks';
import useDoubleClick from '~/hooks/use-double-click';
import { useEventListener } from '~/hooks/use-event-listener';
import { queryClient } from '~/lib/router';
import { isSubtaskData } from '~/modules/app/board/helpers';
import { DropIndicator } from '~/modules/common/drop-indicator';
import { useTaskMutation } from '~/modules/common/query-client-provider/tasks';
import { TaskBlockNote } from '~/modules/tasks/task-dropdowns/task-blocknote';
import { TaskHeader } from '~/modules/tasks/task-header';
import { Checkbox } from '~/modules/ui/checkbox';
import type { Mode } from '~/store/theme';
import type { Subtask as BaseSubtask, Task } from '~/types/app';
import { cn } from '~/utils/cn';
import { getDraggableItemData } from '~/utils/drag-drop';
import { sheet } from '../common/sheeter/state';
import type { TaskStates } from './types';

const Subtask = ({ task, mode }: { task: BaseSubtask; mode: Mode }) => {
  const { t } = useTranslation();

  const subtaskRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<TaskStates>('folded');
  const [dragging, setDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  // const { taskIdPreview } = useSearch({
  //   from: WorkspaceRoute.id,
  // });

  const taskMutation = useTaskMutation();

  const onRemove = (subtaskId: string) => {
    deleteTasks([subtaskId], task.organizationId).then(async (resp) => {
      await queryClient.invalidateQueries({
        refetchType: 'active',
      });
      if (resp) toast.success(t('common:success.delete_resources', { resources: t('app:todos') }));
      else toast.error(t('common:error.delete_resources', { resources: t('app:todos') }));
    });
  };

  const setEdge = ({ self, source }: { source: ElementDragPayload; self: DropTargetRecord }) => {
    if (!isSubtaskData(source.data) || !isSubtaskData(self.data)) return;
    setClosestEdge(extractClosestEdge(self.data));
  };

  const handleUpdateStatus = async (newStatus: number) => {
    try {
      await taskMutation.mutateAsync({
        id: task.id,
        orgIdOrSlug: task.organizationId,
        key: 'status',
        data: newStatus,
        projectId: task.projectId,
      });
      if (sheet.get(`task-preview-${task.parentId}`)) await queryClient.invalidateQueries({ refetchType: 'active' });
    } catch (err) {
      toast.error(t('common:error.update_resource', { resource: t('app:todo') }));
    }
  };

  const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const clickTarget = event.target as HTMLElement;
    if (state !== 'folded' || clickTarget.tagName === 'BUTTON' || clickTarget.closest('button')) return;
    setState('expanded');
  };

  useDoubleClick({
    onDoubleClick: () => {
      if (state === 'editing' || state === 'unsaved') return;
      setState('editing');
    },
    allowedTargets: ['p', 'div', 'img'],
    ref: subtaskRef,
  });

  useEventListener('changeSubtaskState', (e) => {
    const { taskId, state: newState } = e.detail;
    // The logic ensures that tasks are expanded from 'editing' or 'unsaved' states when 'removeEditing' is triggered
    if ((task.parentId === taskId || (task.parentId !== taskId && task.id !== taskId)) && newState === 'removeEditing') {
      if (state === 'editing' || state === 'unsaved') return setState('expanded');
      return;
    }

    // If the task is a subtask of the taskId from the event and the newState is 'folded', fold the task
    if (task.parentId === taskId && newState === 'folded') return setState(newState);

    // If the task.id as the event's taskId, update the task state
    if (task.id === taskId) {
      if (newState === 'removeEditing') return;
      setState(newState);
    }
  });

  useEffect(() => {
    if (state !== 'expanded') return;
    // All elements with a data-url attribute
    const blocks = document.querySelectorAll('[data-url]');
    if (blocks.length < 1) return;

    for (const block of blocks) {
      const url = block.getAttribute('data-url');
      const img = block.querySelector('img');

      //set img src attribute if is inside the block
      if (img && url) img.setAttribute('src', url);
    }
  }, [task.description, state]);

  // create draggable & dropTarget elements and auto scroll
  useEffect(() => {
    const data = getDraggableItemData<BaseSubtask>(task, task.order, 'subtask', 'project');
    const element = subtaskRef.current;
    if (!element) return;

    return combine(
      draggable({
        element,
        dragHandle: element,
        getInitialData: () => data,
        onDragStart: () => setDragging(true),
        canDrag: () => state === 'folded' || state === 'expanded',
        onDrop: () => setDragging(false),
      }),
      dropTargetForExternal({
        element,
      }),
      dropTargetForElements({
        element,
        canDrop({ source }) {
          const data = source.data;
          return isSubtaskData(data) && data.item.id !== task.id;
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
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      ref={subtaskRef}
      onClick={handleCardClick}
      className={`flex items-start gap-1 p-1 mb-0.5 hover:bg-secondary/50 opacity-${dragging ? '30' : '100'} bg-secondary/25`}
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
      <div className="flex flex-col grow min-h-7 justify-center gap-2 mx-1">
        <div className="mt-1 flex flex-col items-start">
          {state === 'folded' ? (
            <div className="mr-1.5 inline leading-none items-center">
              <div
                // biome-ignore lint/security/noDangerouslySetInnerHtml: is sanitized by backend
                dangerouslySetInnerHTML={{ __html: task.summary }}
                data-color-scheme={mode}
                className="bn-container bn-shadcn leading-none inline"
              />
              <SummaryButtons task={task} />
            </div>
          ) : (
            <div className="flex w-full flex-col">
              {state === 'editing' || state === 'unsaved' ? (
                <TaskBlockNote
                  id={task.id}
                  projectId={task.projectId}
                  html={task.description || ''}
                  mode={mode}
                  className="w-full pr-2 bg-transparent border-none"
                  subtask={true}
                  taskToClose={task.parentId}
                />
              ) : (
                <div className={'w-full bg-transparent pr-2 border-none bn-container bn-shadcn'} data-color-scheme={mode}>
                  {/* biome-ignore lint/security/noDangerouslySetInnerHtml: is sanitized by backend */}
                  <div dangerouslySetInnerHTML={{ __html: task.description }} />
                </div>
              )}

              <TaskHeader task={task as Task} state={state} onRemove={onRemove} />
            </div>
          )}
        </div>
      </div>
      {closestEdge && <DropIndicator className="h-0.5" edge={closestEdge} gap={0.2} />}
    </motion.div>
  );
};

export default Subtask;

const SummaryButtons = ({ task }: { task: BaseSubtask }) => {
  return (
    <>
      {task.expandable && <div className="inline-flex px-1 text-sm cursor-pointer py-0 h-5">...</div>}
      {/*  in debug mode: show order number to debug drag */}
      {config.debug && <span className="ml-2 opacity-15 text-sm text-center font-light">#{task.order}</span>}
    </>
  );
};
