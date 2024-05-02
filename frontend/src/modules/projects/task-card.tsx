import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MDEditor from '@uiw/react-md-editor';
import { cva } from 'class-variance-authority';
import { GripVertical, Paperclip } from 'lucide-react';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { Checkbox } from '../ui/checkbox';
import './style.css';
import { useThemeStore } from '~/store/theme';
import type { Task } from '~/mocks/workspaces.ts';
import { SelectImpact } from './select-impact.tsx';
import AssignMembers from './select-members.tsx';
import SetLabels from './select-labels.tsx';
import { useTranslation } from 'react-i18next';
import SelectStatus from './select-status.tsx';
import { TaskEditor } from './task-editor.tsx';
import { useContext, useRef, useState } from 'react';
import { SelectTaskType } from './select-task-type.tsx';
import { WorkspaceContext } from '../workspaces/index.tsx';
import useDoubleClick from '~/hooks/use-double-click.tsx';
import { cn } from '~/lib/utils.ts';

interface TaskCardProps {
  task: Task;
  isOverlay?: boolean;
}

export interface TaskDragData {
  type: 'Task';
  task: Task;
}

export function TaskCard({ task, isOverlay }: TaskCardProps) {
  const { t } = useTranslation();
  const { mode } = useThemeStore();

  const [innerTask, setInnerTask] = useState(task);
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  console.log(innerTask)

  const { updateTasks } = useContext(WorkspaceContext);

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const handleChange = (field: keyof Task, value: any) => {
    const updatedTask = { ...innerTask, [field]: value };
    setInnerTask(updatedTask);
    console.log(!!updateTasks)
    // TODO: we should only replace the array when absolutely necessary due to performance reasons
    // Instead, can we move the
   // updateTasks(updatedTask);
  };

  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: innerTask.id,
    data: {
      type: 'Task',
      task,
    } satisfies TaskDragData,
    attributes: {
      roleDescription: 'Task',
    },
  });

  const style = {
    transition,
    transform: CSS.Translate.toString(transform),
  };

  const variants = cva(
    'group/task rounded-none border-0 text-sm bg-transparent hover:bg-card/20 bg-gradient-to-br from-transparent via-transparent via-60% to-100%',
    {
      variants: {
        dragging: {
          over: 'ring-2 opacity-30',
          overlay: 'ring-2 ring-primary',
        },
        status: {
          0: 'to-sky-600/10',
          1: '',
          2: 'to-slate-600/10',
          3: 'to-lime-600/10',
          4: 'to-yellow-600/10',
          5: 'to-orange-600/10',
          6: 'to-green-600/10',
        },
      },
    },
  );

  const toggleEditorState = () => {
    setIsEditing(!isEditing);
  };

  const summaryRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);

  useDoubleClick({
    onDoubleClick: () => {
      toggleEditorState();
      setIsExpanded(true);
    },
    ref: summaryRef,
    latency: 250,
  });

  useDoubleClick({
    onDoubleClick: () => toggleEditorState(),
    ref: expandedRef,
    latency: 250,
  });

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        variants({
          dragging: isOverlay ? 'overlay' : isDragging ? 'over' : undefined,
          status: innerTask.status,
        }),
        isExpanded ? 'border-l border-primary/50' : 'border-l border-transparent',
      )}
    >
      <CardContent
        id={`${innerTask.id}-content`}
        className={cn('p-2 space-between gap-1 flex flex-col border-b border-secondary relative')}
      >
        <div className="flex flex-col gap-1">
          <div className="flex gap-2 w-full">
            <div className="flex flex-col gap-2 mt-[2px]">
              <SelectTaskType currentType={innerTask.type} changeTaskType={(newType) => handleChange('type', newType)} />

              {isExpanded && <Checkbox className="" />}
            </div>
            <div className="flex flex-col grow">
              {isEditing && (
                <TaskEditor
                  mode={mode}
                  markdown={innerTask.markdown}
                  setMarkdown={(newMarkdown) => handleChange('markdown', newMarkdown)}
                  toggleEditorState={toggleEditorState}
                  id={innerTask.id}
                />
              )}
              {!isEditing && (
                <>
                  <div
                    ref={expandedRef}
                    tabIndex={isExpanded ? 0 : -1}
                    style={{ display: isExpanded ? '' : 'none' }}
                    className="w-full ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 rounded-sm focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <MDEditor.Markdown
                      source={innerTask.markdown}
                      style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C' }}
                      className="prose font-light text-start max-w-none"
                    />
                  </div>
                  <div
                    ref={summaryRef}
                    tabIndex={isExpanded ? -1 : 0}
                    style={{ display: isExpanded ? 'none' : '' }}
                    className="w-full ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 rounded-sm focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <span className="font-light">{innerTask.markdown}</span>
                    <div className="opacity-50 group-hover/task:opacity-70 text-xs inline-block font-light ml-1 gap-1">
                      <Button variant="link" size="micro" onClick={() => setIsExpanded(true)} className="inline-flex py-0 h-5 ml-1">
                        {t('common:more').toLowerCase()}
                      </Button>
                      <Button variant="ghost" size="micro" onClick={() => setIsExpanded(true)} className="inline-flex py-0 h-5 ml-1 gap-[1px]">
                        <span className="text-success">1</span>
                        <span className="font-light">/</span>
                        <span className="font-light">3</span>
                      </Button>
                      <Button variant="ghost" size="micro" onClick={() => setIsExpanded(true)} className="inline-flex py-0 h-5 ml-1 gap-[1px]">
                        <Paperclip size={10} className="transition-transform -rotate-45" />
                        <span>3</span>
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {isExpanded && (
                <div>
                  <div className="font-light py-4">[here will we show attachments and todos as a checklist]</div>
                  <Button variant="link" size="micro" onClick={() => setIsExpanded(false)} className="py-0 h-5 -ml-1 opacity-70">
                    {t('common:less').toLowerCase()}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="max-sm:-ml-1 flex items-center justify-between gap-1">
            <Button
              variant={'ghost'}
              {...attributes}
              {...listeners}
              className="max-sm:hidden py-1 px-0 text-secondary-foreground h-auto cursor-grab opacity-15 transition-opacity group-hover/task:opacity-35"
            >
              <span className="sr-only"> {t('common:move_task')}</span>
              <GripVertical size={16} />
            </Button>

            {innerTask.type !== 'bug' && <SelectImpact viewValue={innerTask.impact} mode="edit" changeTaskImpact={(newImpact) => handleChange('impact', newImpact)} />}

            <SetLabels
              projectId={task.projectId}
              changeLabels={(newLabels) => handleChange('labels', newLabels)}
              viewValue={innerTask.labels}
              mode="edit"
            />
            <div className="grow h-0" />

            <div className="flex gap-2">
              <AssignMembers mode="edit" viewValue={innerTask.assignedTo} changeAssignedTo={(newMembers) => handleChange('assignedTo', newMembers)} />
              <SelectStatus taskStatus={innerTask.status} changeTaskStatus={(newStatus) => handleChange('status', newStatus)} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
