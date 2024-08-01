import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import type { DropTargetRecord, ElementDragPayload } from '@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { dropTargetForExternal } from '@atlaskit/pragmatic-drag-and-drop/external/adapter';
import MDEditor from '@uiw/react-md-editor';
import { Trash } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import useDoubleClick from '~/hooks/use-double-click.tsx';
import { cn, getDraggableItemData } from '~/lib/utils';
import { DropIndicator } from '~/modules/common/drop-indicator';
import { type Task, useElectric } from '~/modules/common/electric/electrify';
import { Button } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import type { Mode } from '~/store/theme';
import type { DraggableItemData } from '~/types';
import { TaskEditor } from './task-selectors/task-editor';

type TaskDraggableItemData = DraggableItemData<Task> & { type: 'subTask' };
export const isSubTaskData = (data: Record<string | symbol, unknown>): data is TaskDraggableItemData => {
  return data.dragItem === true && typeof data.order === 'number' && data.type === 'subTask';
};

const SubTask = ({
  task,
  mode,
  handleTaskChange,
}: { task: Task; mode: Mode; handleTaskChange: (field: keyof Task, value: string | number | null, taskId: string) => void }) => {
  const { t } = useTranslation();
  const electric = useElectric();
  const subTaskRef = useRef<HTMLDivElement>(null);
  const subContentRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  const onRemove = (subTaskId: string) => {
    if (!electric) return toast.error(t('common:local_db_inoperable'));
    electric.db.tasks
      .deleteMany({
        where: {
          id: subTaskId,
        },
      })
      .then(() => toast.success(t('common:success.delete_resources', { resources: t('common:todo') })));
  };

  const setEdge = ({ self, source }: { source: ElementDragPayload; self: DropTargetRecord }) => {
    if (!isSubTaskData(source.data) || !isSubTaskData(self.data)) return;
    setClosestEdge(extractClosestEdge(self.data));
  };

  const handleUpdateMarkdown = (markdownValue: string) => {
    const summaryFromMarkDown = markdownValue.split('\n')[0];
    handleTaskChange('markdown', markdownValue, task.id);
    handleTaskChange('summary', summaryFromMarkDown, task.id);
  };

  useDoubleClick({
    onSingleClick: () => setIsEditing(true),
    allowedTargets: ['p', 'div'],
    ref: subTaskRef,
  });

  // create draggable & dropTarget elements and auto scroll
  useEffect(() => {
    const data = getDraggableItemData<Task>(task, task.sort_order, 'subTask', 'project');
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
          return isSubTaskData(data) && data.item.id !== task.id && data.type === 'subTask';
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
    <div
      ref={subTaskRef}
      id="sub-item"
      className={`relative flex items-start gap-1 p-1 border-b-2 hover:bg-secondary/80 border-background opacity-${dragging ? '30' : '100'}  bg-secondary`}
    >
      <div className="flex flex-col gap-2 relative">
        <Checkbox
          className={cn(
            'group-[.is-selected]/column:opacity-100 group-[.is-selected]/column:z-30 group-[.is-selected]/column:pointer-events-auto',
            'transition-all bg-background w-5 h-5 m-1 ml-1.5',
            `${task.status === 6 ? 'data-[state=checked]:bg-green-700 border-green-700' : 'border-gray-500'}`,
          )}
          checked={task.status === 6}
          onCheckedChange={(checkStatus) => {
            if (checkStatus) handleTaskChange('status', 6, task.id);
            if (!checkStatus) handleTaskChange('status', 1, task.id);
          }}
        />
      </div>
      <div className="flex flex-col grow min-h-7 justify-center gap-2 mx-1">
        <div ref={subContentRef} className="inline">
          {isEditing ? (
            <TaskEditor mode={mode} markdown={task.markdown || ''} handleUpdateMarkdown={handleUpdateMarkdown} id={task.id} />
          ) : (
            <MDEditor.Markdown
              source={isEditing ? task.markdown || '' : task.summary}
              style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C' }}
              className={`${isEditing ? 'markdown' : 'summary'} inline before:!content-none after:!content-none prose font-light text-start max-w-none`}
            />
          )}
          {task.summary !== task.markdown && (
            <Button onClick={() => setIsEditing(!isEditing)} variant="link" size="micro" className="py-0 ml-1">
              {t(`common:${isEditing ? 'less' : 'more'}`).toLowerCase()}
            </Button>
          )}
        </div>
      </div>
      <Button onClick={() => onRemove(task.id)} variant="ghost" size="xs" className="text-secondary-foreground cursor-pointer opacity-30">
        <span className="sr-only">{t('common:move_task')}</span>
        <Trash size={16} />
      </Button>
      {closestEdge && <DropIndicator className="h-0.5" edge={closestEdge} gap={0.2} />}
    </div>
  );
};

export default SubTask;
