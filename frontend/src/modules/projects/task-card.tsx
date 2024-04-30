import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MDEditor from '@uiw/react-md-editor';
import { cva } from 'class-variance-authority';
import { CheckCheck, GripVertical, Paperclip } from 'lucide-react';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { Checkbox } from '../ui/checkbox';
import './style.css';
import { useThemeStore } from '~/store/theme';
import type { Task } from '~/mocks/dataGeneration';
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

  const { updateTasks } = useContext(WorkspaceContext);

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const handleChange = (field: keyof Task, value: any) => {
    const updatedTask = { ...innerTask, [field]: value };
    setInnerTask(updatedTask);
    updateTasks(updatedTask);
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
    'group/task rounded-none border-0 text-sm bg-transparent hover:bg-card bg-gradient-to-br from-transparent via-transparent via-60% to-100%',
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

  const buttonRef = useRef<HTMLButtonElement>(null);

  useDoubleClick({
    onSingleClick: (e) => {
      console.log(e, 'single click');
      if(isExpanded) toggleEditorState();
      if(!isExpanded) setIsExpanded(true);
    },
    onDoubleClick: (e) => {
      console.log(e, 'double click');
      toggleEditorState();
    },
    ref: buttonRef,
    latency: 250,
  });

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={variants({
        dragging: isOverlay ? 'overlay' : isDragging ? 'over' : undefined,
        status: innerTask.status,
      })}
    >
      <CardContent className={cn('p-2 space-between gap-1 flex flex-col border-b border-secondary relative group/content', isExpanded ? 'is-expanded' : 'is-collapsed')}>
        <div className="flex flex-col gap-1">
          <div className="flex gap-2 w-full">
            <div className="flex flex-col gap-2 mt-[2px]">
              <SelectTaskType currentType={innerTask.type} changeTaskType={(newType) => handleChange('type', newType)} />

              <Checkbox className="opacity-0 transition-opacity duration-700 group-hover/task:opacity-100" />
            </div>
            <div className="flex flex-col grow">
              {isEditing ? (
                <TaskEditor
                  mode={mode}
                  markdown={innerTask.markdown}
                  setMarkdown={(newMarkdown) => handleChange('markdown', newMarkdown)}
                  toggleEditorState={toggleEditorState}
                  id={innerTask.id}
                />
              ) : (
                <button type="button" ref={buttonRef} className="w-full">
                  <MDEditor.Markdown
                    source={innerTask.markdown}
                    style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C' }}
                    className="prose font-light text-start max-w-none"
                  />
                </button>
              )}
              {isExpanded && <div className="font-light py-4">[here will we show attachments and todos as a checklist]</div>}
              <div className="opacity-50 group-hover/task:opacity-75 text-xs items-center font-light flex gap-1">
                <div>F</div>
                <div>&#183;</div>
                <div>2d</div>
                <div>&#183;</div>
                <Button variant="ghost" size="micro" onClick={() => setIsExpanded(true)} className="collapsed-only flex gap-[2px]">
                  <CheckCheck size={12} />
                  <span className="text-success">1</span>
                  <span className="font-light scale-90">/ 3</span>
                </Button>
                <div className="collapsed-only">&#183;</div>
                <Button variant="ghost" size="micro" onClick={() => setIsExpanded(true)} className="collapsed-only flex gap-[2px]">
                  <Paperclip size={12} />
                  <span>3</span>
                </Button>
                <div className="collapsed-only">&#183;</div>
                <Button variant="ghost" size="micro" onClick={() => setIsExpanded(!isExpanded)} className="flex gap-[2px]">
                <span className="group-[.is-collapsed]/content:hidden">{t('common:less_info')}</span>
                <span className="group-[.is-expanded]/content:hidden">{t('common:more_info')}</span>
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-1">
            <Button
              variant={'ghost'}
              {...attributes}
              {...listeners}
              className="py-1 px-0 text-secondary-foreground/50 h-auto cursor-grab group-hover/task:opacity-100 opacity-70"
            >
              <span className="sr-only"> {t('common:move_task')}</span>
              <GripVertical size={16} />
            </Button>

            {innerTask.type !== 'bug' && <SelectImpact viewValue={innerTask.impact} mode="edit" />}
            <div className="grow">
              <SetLabels
                projectId={task.projectId}
                changeLabels={(newLabels) => handleChange('labels', newLabels)}
                viewValue={innerTask.labels}
                mode="edit"
              />
            </div>

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
