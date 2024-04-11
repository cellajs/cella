import type { UniqueIdentifier } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MDEditor from '@uiw/react-md-editor';
import { cva } from 'class-variance-authority';
import { Activity, GripVertical, Star, UnfoldVertical, FoldVertical } from 'lucide-react';
import { useEffect, useState } from 'react';
import { dateShort } from '~/lib/utils';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardHeader } from '~/modules/ui/card';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '~/modules/ui/hover-card';
import type { ColumnId } from './kanban-board';
import { Checkbox } from '../ui/checkbox';
import { LabelBox } from './labels';

export interface Task {
  id: UniqueIdentifier;
  columnId: ColumnId;
  content: string;
}

interface TaskCardProps {
  task: Task;
  isOpen?: boolean;
  toggleTaskClick?: (id: UniqueIdentifier) => void;
  isOverlay?: boolean;
}

export type TaskType = 'Task';

export interface TaskDragData {
  type: TaskType;
  task: Task;
}

export function TaskCard({ task, toggleTaskClick, isOverlay, isOpen }: TaskCardProps) {
  const [value, setValue] = useState<string | undefined>(task.content);
  const [isLabelBoxOpen, setLabelBoxOpen] = useState<boolean>(false);

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

  const variants = cva('rounded-none border-0 text-sm border-b', {
    variants: {
      dragging: {
        over: 'ring-2 opacity-30',
        overlay: 'ring-2 ring-primary',
      },
    },
  });

  const openLabelBox = () => {
    setLabelBoxOpen(true);
  };
  const closeLabelBox = () => {
    setLabelBoxOpen(false);
  };

  const toggleEditorState = () => {
    if (toggleTaskClick) toggleTaskClick(task.id);
  };

  //TODO: Replace with actual user data
  const user = {
    id: '1sdfsdsdfsdfwe4rw34rf',
    name: 'John Doe',
    thumbnailUrl: null,
    bio: 'sdfsd sdfs sd fsafsf asdfad fafd; asdf asf safd sfdsfs fsd sdfdsg .fdg dfg dfgd fgdfgdfg',
  };

  useEffect(() => {
    if (value) task.content = value;
  }, [value]);

  // Get the textarea element
  useEffect(() => {
    const editorTextAria = document.getElementById(task.id as string);
    if (!editorTextAria) return;
    const textAreaElement = editorTextAria as HTMLTextAreaElement;
    if (value) textAreaElement.value = value;
    textAreaElement.focus();
    textAreaElement.setSelectionRange(textAreaElement.value.length, textAreaElement.value.length);
  }, [task.id]);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={variants({
        dragging: isOverlay ? 'overlay' : isDragging ? 'over' : undefined,
      })}
    >
      <CardHeader className="p-2 pr-4 space-between flex flex-col border-b border-secondary relative">
        {!isOpen && (
          <Button onClick={toggleEditorState} size={'auto'} variant="secondary" className="w-full flex justify-start bg-transparent">
            <div className="flex items-center gap-2">
              <div className="group mt-[2px]">
                <Checkbox className="opacity-0 absolute group-hover:opacity-100 transition-opacity z-10" />
                <Star size={16} className="fill-amber-400 text-amber-500 group-hover:opacity-0 transition-opacity" />
                {/* <Bug size={16} className="fill-red-500 text-red-600 group-hover:opacity-0 transition-opacity" /> */}
                {/* <Bolt size={16} className="fill-slate-500 text-slate-600 group-hover:opacity-0 transition-opacity" /> */}
              </div>
              <MDEditor.Markdown source={task.content} style={{ textAlign: 'start', background: 'transparent', whiteSpace: 'pre-wrap' }} />
            </div>
          </Button>
        )}
        {isOpen && (
          <>
            <MDEditor
              textareaProps={{ id: task.id as string }}
              value={value}
              preview={'edit'}
              onChange={(newValue) => setValue(newValue)}
              autoFocus={true}
              hideToolbar={true}
              visibleDragbar={false}
              height={'auto'}
              style={{ background: 'transparent', boxShadow: 'none' }}
            />
          </>
        )}

        <div className={`flex items-center justify-${isOpen ? 'between' : 'end'} mt-1 gap-2`}>
          {isOpen && (
            <div className="flex gap-2">
              <Button variant={'ghost'} {...attributes} {...listeners} className="py-1 px-0 text-secondary-foreground/50 h-auto cursor-grab">
                <span className="sr-only">Move task</span>
                <GripVertical size={16} />
              </Button>
              <Button onClick={toggleEditorState} variant="plain" size="sm" className="rounded text-[12px] p-1 h-6">
                Collapse
              </Button>
            </div>
          )}

          <div className="flex  gap-2">
            <HoverCard>
              <HoverCardTrigger>
                <AvatarWrap type="user" id={user.id} name={user.name} url={user.thumbnailUrl} className="h-6 w-6" />
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                <div className="flex justify-between space-x-4">
                  <AvatarWrap type="user" id={user.id} name={user.name} url={user.thumbnailUrl} />
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
            <Button variant="plain" size="sm" className="rounded text-[12px] p-1 h-6">
              Start
            </Button>
          </div>
        </div>
        <div className="flex gap-1">
          <LabelBox boxOpen={isLabelBoxOpen} />
          {isLabelBoxOpen && (
            <Button onClick={closeLabelBox} size={'xs'} variant="outlineGhost">
              <FoldVertical className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          )}
          {!isLabelBoxOpen && (
            <Button onClick={openLabelBox} variant="outlineGhost" size={'xs'}>
              <UnfoldVertical className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          )}
        </div>
      </CardHeader>
      {isOpen && <CardContent className="px-3 pt-3 pb-6 text-left whitespace-pre-wrap">collapsed info here</CardContent>}
    </Card>
  );
}
