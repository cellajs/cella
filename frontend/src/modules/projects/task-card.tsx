import type { UniqueIdentifier } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MDEditor from '@uiw/react-md-editor';
import { cva } from 'class-variance-authority';
import { Activity, GripVertical, Star, Bug, Bolt } from 'lucide-react';
import { useEffect, useState } from 'react';
import { dateShort } from '~/lib/utils';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '~/modules/ui/hover-card';
import { Checkbox } from '../ui/checkbox';
import { LabelBox } from './labels';
import './style.css';
import { useThemeStore } from '~/store/theme';
import type { Task } from '~/mocks/dataGeneration';
import { SelectImpact } from './select-impact.tsx/index.tsx';
import SelectStatusButtons from './card-status-change.tsx';

interface User {
  id: UniqueIdentifier;
  name: string;
  thumbnailUrl: null;
  bio: string;
}

interface TaskCardProps {
  task: Task;
  isViewState?: boolean;
  toggleTaskClick?: (id: UniqueIdentifier) => void;
  isOverlay?: boolean;
  user: User;
  setTaskStatus: (task: Task, status: 0 | 1 | 2 | 3 | 4 | 5 | 6) => void;
}

export type TaskType = 'Task';

export interface TaskDragData {
  type: TaskType;
  task: Task;
}

export function TaskCard({ task, toggleTaskClick, isOverlay, isViewState, user, setTaskStatus }: TaskCardProps) {
  const [value, setValue] = useState<string | undefined>(task.text);
  const [status, setStatus] = useState(task.status);
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

  const variants = cva('group/task rounded-none border-0 text-sm bg-transparent hover:bg-card', {
    variants: {
      dragging: {
        over: 'ring-2 opacity-30',
        overlay: 'ring-2 ring-primary',
      },
      status: {
        accepted: 'bg-gradient-to-br from-transparent via-transparent via-60% to-lime-500/25 to-100%',
        iced: 'bg-gradient-to-br from-transparent from-0% via-transparent via-60% to-sky-500/25 to-1090%',
      },
    },
  });

  const toggleEditorState = () => {
    if (toggleTaskClick) toggleTaskClick(task.id);
  };

  useEffect(() => {
    if (value) task.text = value;
  }, [value]);

  // Textarea autofocus cursor on the end of the value
  useEffect(() => {
    if (isViewState) {
      const editorTextAria = document.getElementById(task.id as string);
      if (!editorTextAria) return;
      const textAreaElement = editorTextAria as HTMLTextAreaElement;
      if (value) textAreaElement.value = value;
      textAreaElement.focus();
      textAreaElement.setSelectionRange(textAreaElement.value.length, textAreaElement.value.length);
    }
  }, [task.id, isViewState]);

  useEffect(() => {
    setTaskStatus(task, status);
  }, [status]);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={variants({
        dragging: isOverlay ? 'overlay' : isDragging ? 'over' : undefined,
        status: task.status === 6 ? 'accepted' : task.status === 0 ? 'iced' : undefined,
      })}
    >
      <CardContent className="p-2 pr-4 space-between gap-2 flex flex-col border-b border-secondary relative">
        <div className="flex gap-2">
          <div className="flex flex-col gap-2">
            <div className="group mt-[2px]">
              <Checkbox className="opacity-0 absolute group-hover:opacity-100 transition-opacity z-10" />
              {task.type === 'feature' && <Star size={16} className="fill-amber-400 text-amber-500 group-hover:opacity-0 transition-opacity" />}
              {task.type === 'bug' && <Bug size={16} className="fill-red-500 text-red-600 group-hover:opacity-0 transition-opacity" />}
              {task.type === 'chore' && <Bolt size={16} className="fill-slate-500 text-slate-600 group-hover:opacity-0 transition-opacity" />}
            </div>
          </div>
          {!isViewState && (
            // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
            <div onClick={toggleEditorState}>
              <MDEditor.Markdown source={task.text} style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C' }} className="prose font-light" />
            </div>
          )}
          {isViewState && (
            <div className="flex flex-col gap-2" data-color-mode="dark">
              <MDEditor
                textareaProps={{ id: task.id as string }}
                value={value}
                preview={'edit'}
                onChange={(newValue) => setValue(newValue)}
                autoFocus={true}
                hideToolbar={true}
                visibleDragbar={false}
                height={'auto'}
                style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C', background: 'transparent', boxShadow: 'none', padding: '0' }}
              />

              <div className="flex gap-2">
                <Button onClick={toggleEditorState} size="sm" className="rounded text-[12px] p-1 h-6">
                  Save
                </Button>

                <Button onClick={toggleEditorState} variant="secondary" size="sm" className="rounded text-[12px] p-1 h-6">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-1 gap-2">
          <Button variant={'ghost'} {...attributes} {...listeners} className="py-1 px-0 text-secondary-foreground/50 h-auto cursor-grab">
            <span className="sr-only">Move task</span>
            <GripVertical size={16} />
          </Button>

          {task.type !== 'bug' && <SelectImpact mode="edit" />}
          <LabelBox />

          <div className="flex gap-2">
            <HoverCard>
              <HoverCardTrigger>
                <AvatarWrap type="USER" id={user.id as string} name={user.name} url={user.thumbnailUrl} className="h-6 w-6" />
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                <div className="flex justify-between space-x-4">
                  <AvatarWrap type="USER" id={user.id as string} name={user.name} url={user.thumbnailUrl} />
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold">{user.name}</h4>
                    <p className="text-sm">{user.bio}</p>
                    <div className="flex items-center pt-2">
                      <Activity className="mr-2 h-4 w-4 opacity-70" />{' '}
                      <span className="text-xs text-muted-foreground">{dateShort(new Date().toISOString())}</span>
                    </div>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
            <SelectStatusButtons taskStatus={status} changeTaskStatus={(value) => setStatus(value as typeof status)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
