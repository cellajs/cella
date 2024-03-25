import type { UniqueIdentifier } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cva } from 'class-variance-authority';
import { Activity, GripVertical } from 'lucide-react';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardHeader } from '~/modules/ui/card';
import type { ColumnId } from './kanban-board';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '~/modules/ui/hover-card';
import { dateShort } from '~/lib/utils';

export interface Task {
  id: UniqueIdentifier;
  columnId: ColumnId;
  content: string;
}

interface TaskCardProps {
  task: Task;
  isOverlay?: boolean;
}

export type TaskType = 'Task';

export interface TaskDragData {
  type: TaskType;
  task: Task;
}

export function TaskCard({ task, isOverlay }: TaskCardProps) {
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

  const variants = cva('rounded-none border-0 text-sm border-b border-border', {
    variants: {
      dragging: {
        over: 'ring-2 opacity-30',
        overlay: 'ring-2 ring-primary',
      },
    },
  });

  //TODO: Replace with actual user data
  const user = {
    id: '1sdfsdsdfsdfwe4rw34rf',
    name: 'John Doe',
    thumbnailUrl: null,
    bio: 'sdfsd sdfs sd fsafsf asdfad fafd; asdf asf safd sfdsfs fsd sdfdsg .fdg dfg dfgd fgdfgdfg'
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={variants({
        dragging: isOverlay ? 'overlay' : isDragging ? 'over' : undefined,
      })}
    >
      <CardHeader className="px-3 py-3 space-between flex flex-col border-b border-secondary relative">
        <div className="flex items-center gap-2">
          <Button variant={'ghost'} {...attributes} {...listeners} className="p-1 text-secondary-foreground/50 -ml-2 h-auto cursor-grab">
            <span className="sr-only">Move task</span>
            <GripVertical />
          </Button>
          <div>{task.content}</div>

          <HoverCard>
            <HoverCardTrigger>
              <AvatarWrap type="user" id={user.id} name={user.name} url={user.thumbnailUrl} className="h-6 w-6" />
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="flex justify-between space-x-4">
              <AvatarWrap type="user" id={user.id} name={user.name} url={user.thumbnailUrl} className="" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">{user.name}</h4>
                  <p className="text-sm">{user.bio}</p>
                  <div className="flex items-center pt-2">
                    <Activity className="mr-2 h-4 w-4 opacity-70" /> <span className="text-xs text-muted-foreground">{dateShort(new Date().toISOString())}</span>
                  </div>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
      </CardHeader>
      <CardContent className="px-3 pt-3 pb-6 text-left whitespace-pre-wrap">collapsed info here</CardContent>
    </Card>
  );
}
