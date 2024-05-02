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
import { SelectImpact } from './select-impact.tsx';
import SetLabels from './select-labels.tsx';
import { useTranslation } from 'react-i18next';
import SelectStatus, { type TaskStatus } from './select-status.tsx';
import { TaskEditor } from './task-editor.tsx';
import { useRef, useState } from 'react';
import { SelectTaskType } from './select-task-type.tsx';
import useDoubleClick from '~/hooks/use-double-click.tsx';
import { cn } from '~/lib/utils.ts';
import { useElectric, type Task } from '../common/root/electric.ts';
import type { TaskImpact, TaskType } from './task-form.tsx';

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

  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const { db } = useElectric()!;

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const handleChange = (field: keyof Task, value: any) => {
    db.tasks.update({
      data: {
        [field]: value,
      },
      where: {
        id: task.id,
      },
    });
  };

  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: task.id,
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
      })}
    >
      <CardContent
        className={cn(
          'p-2 space-between gap-1 flex flex-col border-b border-secondary relative group/content',
          isExpanded ? 'is-expanded' : 'is-collapsed',
        )}
      >
        <div className="flex flex-col gap-1">
          <div className="flex gap-2 w-full">
            <div className="flex flex-col gap-2 mt-[2px]">
              <SelectTaskType currentType={task.type as TaskType} changeTaskType={(newType) => handleChange('type', newType)} />

              <Checkbox className="opacity-0 transition-opacity duration-700 group-hover/task:opacity-100" />
            </div>
            <div className="flex flex-col grow">
              {isEditing ? (
                <TaskEditor
                  mode={mode}
                  markdown={task.markdown}
                  setMarkdown={(newMarkdown) => handleChange('markdown', newMarkdown)}
                  toggleEditorState={toggleEditorState}
                  id={task.id}
                />
              ) : (
                <button type="button" ref={buttonRef} className="w-full">
                  <MDEditor.Markdown
                    source={task.markdown || undefined}
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

            {task.type !== 'bug' && (
              <SelectImpact
                viewValue={task.impact as TaskImpact}
                changeTaskImpact={(value) => {
                  handleChange('impact', value);
                }}
                mode="edit"
              />
            )}
            <div className="grow">
              <SetLabels
                projectId={task.project_id}
                // changeLabels={(newLabels) => handleChange('labels', newLabels)}
                // viewValue={innerTask.labels}
                mode="edit"
              />
            </div>

            <div className="flex gap-2">
              {/* <AssignMembers mode="edit" viewValue={innerTask.assignedTo} changeAssignedTo={(newMembers) => handleChange('assignedTo', newMembers)} /> */}
              <SelectStatus taskStatus={task.status as TaskStatus} changeTaskStatus={(newStatus) => handleChange('status', newStatus)} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
