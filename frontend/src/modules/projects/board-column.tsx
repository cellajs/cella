import { type UniqueIdentifier, useDndContext } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cva } from 'class-variance-authority';
import { ChevronDown, Footprints, GripVertical, Maximize2, Plus, Settings } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardHeader } from '~/modules/ui/card';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { type Task, TaskCard } from './task-card';

export interface Column {
  id: UniqueIdentifier;
  title: string;
}

export type ColumnType = 'Column';

export interface ColumnDragData {
  type: ColumnType;
  column: Column;
}

interface BoardColumnProps {
  column: Column;
  tasks: Task[];
  isOverlay?: boolean;
}

export function BoardColumn({ column, tasks, isOverlay }: BoardColumnProps) {
  const tasksIds = useMemo(() => {
    return tasks.map((task) => task.id);
  }, [tasks]);

  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: {
      type: 'Column',
      column,
    } satisfies ColumnDragData,
    attributes: {
      roleDescription: `Column: ${column.title}`,
    },
  });

  const style = {
    transition,
    transform: CSS.Translate.toString(transform),
  };

  const variants = cva('h-[80vh] max-w-full bg-card flex flex-col flex-shrink-0 snap-center', {
    variants: {
      dragging: {
        default: 'border-2 border-transparent',
        over: 'ring-2 opacity-30',
        overlay: 'ring-2 ring-primary',
      },
    },
  });

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={variants({
        dragging: isOverlay ? 'overlay' : isDragging ? 'over' : undefined,
      })}
    >
      <CardHeader className="p-3 font-semibold border-b flex flex-row gap-2 space-between items-center">
        <Button variant={'ghost'} {...attributes} {...listeners} className=" py-1 px-0 text-primary/50 -ml-1 h-auto cursor-grab relative">
          <span className="sr-only">{`Move column: ${column.title}`}</span>
          <GripVertical size={16} />
        </Button>
        <div> {column.title}</div>

        <div className="grow" />
        <Button variant="ghost" size="sm" className="rounded text-sm p-2 h-8">
          <Footprints size={16} />
        </Button>
        <Button variant="ghost" size="sm" className="rounded text-sm p-2 h-8">
          <Maximize2 size={16} />
        </Button>
        <Button variant="ghost" size="sm" className="rounded text-sm p-2 h-8">
          <Settings size={16} />
        </Button>
        <Button variant="plain" size="sm" className="rounded text-sm p-2 h-8">
          <Plus size={16} className="mr-1" />
          Story
        </Button>
      </CardHeader>
      <ScrollArea>
        <CardContent className="flex flex-grow flex-col p-0">
          <Button variant="plain" size="sm" className="w-full rounded-none gap-1 border-none opacity-75 hover:opacity-100 text-success text-sm -mt-[1px]">
            <span className="text-[12px]">16 accepted stories</span>
            <ChevronDown size={12} />
          </Button>
          <SortableContext items={tasksIds}>
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </SortableContext>
          <Button variant="plain" size="sm" className="w-full rounded-none gap-1 border-none opacity-75 hover:opacity-100 text-sky-600 text-sm -mt-[1px]">
            <span className="text-[12px]">12 iced stories</span>
            <ChevronDown size={12} />
          </Button>
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

export function BoardContainer({ children }: { children: React.ReactNode }) {
  const dndContext = useDndContext();

  const variations = cva('px-2 md:px-0 flex lg:justify-center pb-4', {
    variants: {
      dragging: {
        default: 'snap-x snap-mandatory',
        active: 'snap-none',
      },
    },
  });

  return (
    <ScrollArea
      className={variations({
        dragging: dndContext.active ? 'active' : 'default',
      })}
    >
      <div className="flex gap-2 items-center flex-row justify-center">{children}</div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
