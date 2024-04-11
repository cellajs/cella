import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MDEditor from '@uiw/react-md-editor';
import { cva } from 'class-variance-authority';
import { Activity, GripVertical, Star, Trash } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dateShort } from '~/lib/utils';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardHeader } from '~/modules/ui/card';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '~/modules/ui/hover-card';
import { useElectric, type Task } from '../common/root/electric';
import { Checkbox } from '../ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

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
  const [value, setValue] = useState<string | undefined>('**Hello world!!!**');
  const { t } = useTranslation();

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const { db } = useElectric()!;

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

  //TODO: Replace with actual user data
  const user = {
    id: '1sdfsdsdfsdfwe4rw34rf',
    name: 'John Doe',
    thumbnailUrl: null,
    bio: 'sdfsd sdfs sd fsafsf asdfad fafd; asdf asf safd sfdsfs fsd sdfdsg .fdg dfg dfgd fgdfgdfg',
  };

  const onDelete = () => {
    db.tasks.delete({ where: { id: task.id } });
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={variants({
        dragging: isOverlay ? 'overlay' : isDragging ? 'over' : undefined,
      })}
    >
      <CardHeader className="p-2 pr-4 space-between flex flex-col border-b border-secondary relative">
        <div className="flex gap-2 items-center">
          <div className="group mt-[2px]">
            <Checkbox className="opacity-0 absolute group-hover:opacity-100 transition-opacity z-10" />
            <Star size={16} className="fill-amber-400 text-amber-500 group-hover:opacity-0 transition-opacity" />
            {/* <Bug size={16} className="fill-red-500 text-red-600 group-hover:opacity-0 transition-opacity" /> */}
            {/* <Bolt size={16} className="fill-slate-500 text-slate-600 group-hover:opacity-0 transition-opacity" /> */}
          </div>
          <h3 className="font-semibold">{task.name}</h3>
          <div className="">
            <span>{task.description}</span>
            <span className="font-light opacity-50">2d &#183; F</span>
          </div>
          <div className="ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="rounded text-sm p-2 h-8" onClick={onDelete}>
                  <Trash size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={13}>
                {t('Delete task')}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div>
          <MDEditor value={value} onChange={(newValue) => setValue(newValue)} />
          <MDEditor.Markdown source={value} style={{ whiteSpace: 'pre-wrap' }} />
        </div>
        <div className="flex items-center mt-1 gap-2">
          <Button variant={'ghost'} {...attributes} {...listeners} className="py-1 px-0 text-secondary-foreground/50 h-auto cursor-grab">
            <span className="sr-only">Move task</span>
            <GripVertical size={16} />
          </Button>

          <div className="grow text-[12px] font-light">
            <span className="font-semibold opacity-75">label</span>
            <span className="mr-1 opacity-50">,</span>
            <span className="font-semibold opacity-75">label</span>
            <span className="mr-1 opacity-50">,</span>
            <span className="font-semibold opacity-75">label</span>
          </div>

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
      </CardHeader>
      <CardContent className="px-3 pt-3 pb-6 text-left whitespace-pre-wrap">collapsed info here</CardContent>
    </Card>
  );
}
