import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MDEditor from '@uiw/react-md-editor';
import { cva } from 'class-variance-authority';
import { GripVertical, Star, Bug, Bolt } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { Checkbox } from '../ui/checkbox';
import './style.css';
import { useThemeStore } from '~/store/theme';
import type { Task } from '~/mocks/dataGeneration';
import { SelectImpact } from './select-impact.tsx/index.tsx';
import SelectStatus from './select-status.tsx';
import AssignMembers from './assign-members.tsx';
import SetLabels from './set-labels.tsx';
import { useTranslation } from 'react-i18next';
import { SelectTaskType } from './select-task-type.tsx';

interface User {
  id: string;
  name: string;
  thumbnailUrl: null;
  bio: string;
}

interface TaskCardProps {
  task: Task;
  isEditing?: boolean;
  toggleTaskClick?: (id: string) => void;
  isOverlay?: boolean;
  setTaskStatus: (task: Task, status: 0 | 1 | 2 | 3 | 4 | 5 | 6) => void;
  setMainAssignedTo: (task: Task, users: User[]) => void;
}

export type TaskType = 'Task';

export interface TaskDragData {
  type: TaskType;
  task: Task;
}

export function TaskCard({ task, toggleTaskClick, isOverlay, isEditing, setTaskStatus, setMainAssignedTo }: TaskCardProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState<string | undefined>(task.markdown);
  const [type, setType] = useState<'feature' | 'bug' | 'chore'>(task.type);
  const [status, setStatus] = useState(task.status);

  const [assignedTo, setAssignedTo] = useState(task.assignedTo);
  const { mode } = useThemeStore();
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
    if (toggleTaskClick) toggleTaskClick(task.id);
  };

  useEffect(() => {
    if (value) task.markdown = value;
  }, [value]);

  useEffect(() => {
    setMainAssignedTo(task, assignedTo);
  }, [assignedTo]);

  // Textarea autofocus cursor on the end of the value
  useEffect(() => {
    if (isEditing) {
      const editorTextAria = document.getElementById(task.id);
      if (!editorTextAria) return;
      const textAreaElement = editorTextAria as HTMLTextAreaElement;
      if (value) textAreaElement.value = value;
      textAreaElement.focus();
      textAreaElement.setSelectionRange(textAreaElement.value.length, textAreaElement.value.length);
    }
  }, [task.id, isEditing]);

  useEffect(() => {
    setTaskStatus(task, status);
  }, [status]);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={variants({
        dragging: isOverlay ? 'overlay' : isDragging ? 'over' : undefined,
        status: task.status,
      })}
    >
      <CardContent className="p-2 pr-4 space-between gap-2 flex flex-col border-b border-secondary relative">
        <div className="flex gap-2">
          <div className="flex flex-col gap-2">
            <div className="group mt-[2px] ">
              {isEditing ? (
                <SelectTaskType
                  currentType={type}
                  changeTaskType={(newType) => setType(newType)}
                  className="opacity-0 absolute group-hover:opacity-100 transition-opacity z-10"
                />
              ) : (
                <Checkbox className="opacity-0 absolute group-hover:opacity-100 transition-opacity z-10" />
              )}
              {type === 'feature' && <Star size={16} className="fill-amber-400 text-amber-500 group-hover:opacity-0 transition-opacity" />}
              {type === 'bug' && <Bug size={16} className="fill-red-400 text-red-500 group-hover:opacity-0 transition-opacity" />}
              {type === 'chore' && <Bolt size={16} className="fill-slate-400 text-slate-500 group-hover:opacity-0 transition-opacity" />}
            </div>
          </div>
          {!isEditing && (
            // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
            <div onClick={toggleEditorState}>
              <MDEditor.Markdown source={task.markdown} style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C' }} className="prose font-light" />
            </div>
          )}
          {isEditing && (
            <div className="flex flex-col gap-2" data-color-mode="dark">
              <MDEditor
                textareaProps={{ id: task.id }}
                value={value}
                preview={'edit'}
                onChange={(newValue) => setValue(newValue)}
                defaultTabEnable={true}
                hideToolbar={true}
                visibleDragbar={false}
                height={'auto'}
                minHeight={20}
                style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C', background: 'transparent', boxShadow: 'none', padding: '0' }}
              />

              <div className="flex gap-2">
                <Button onClick={toggleEditorState} size="sm" className="rounded text-[12px] p-1 h-6">
                  {t('common:save')}
                </Button>

                <Button onClick={toggleEditorState} variant="secondary" size="sm" className="rounded text-[12px] p-1 h-6">
                  {t('common:cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-1 gap-1">
          <Button
            variant={'ghost'}
            {...attributes}
            {...listeners}
            className="py-1 px-0 text-secondary-foreground/50 h-auto cursor-grab group-hover/task:opacity-100 opacity-70"
          >
            <span className="sr-only"> {t('common:move_task')}</span>
            <GripVertical size={16} />
          </Button>

          {type !== 'bug' && <SelectImpact mode="edit" />}
          <div className="grow">
            <SetLabels
              // labels={task.labels} // TODO set labels from task
              mode="edit"
            />
          </div>

          <div className="flex gap-2">
            <AssignMembers mode="edit" changeAssignedTo={setAssignedTo} />
            <SelectStatus taskStatus={status} changeTaskStatus={(value) => setStatus(value as typeof status)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
