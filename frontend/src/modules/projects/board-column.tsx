import { type UniqueIdentifier, useDndContext } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cva } from 'class-variance-authority';
import { ChevronDown, GripVertical, Plus } from 'lucide-react';
import { type RefObject, useMemo, useState } from 'react';
import { BackgroundPicker } from '~/modules/common/background-picker';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardHeader } from '~/modules/ui/card';
import { ScrollArea } from '~/modules/ui/scroll-area';
import ToolTipButtons from './tooltip-buttons';
import { useMeasure } from '~/hooks/use-measure';
import type { Task } from '~/mocks/dataGeneration';
import { TaskCard } from './task-card';
import CreateStoryForm from './task-card-form';

export interface Column {
  id: UniqueIdentifier;
  name: string;
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
  const [allTasks, setAllTasks] = useState<Task[]>(tasks);
  const [foldedTasks, setFoldedTasks] = useState<UniqueIdentifier[]>(allTasks.map((el) => el.id));
  const [showCreationForm, setShowCreationForm] = useState(false);
  const [showIcedStories, setShowIcedStories] = useState(false);
  const [showAcceptedStories, setShowAcceptedStories] = useState(false);

  const { ref, bounds } = useMeasure();

  const neededWidth = 375;

  const toggleTaskVisibility = (taskId: UniqueIdentifier) => {
    setFoldedTasks((prevIds) => {
      if (prevIds.includes(taskId)) {
        return prevIds.filter((id) => id !== taskId);
      }
      return [...prevIds, taskId];
    });
  };

  const setTaskStatus = (task: Task, status: 0 | 1 | 2 | 3 | 4 | 5 | 6) => {
    const updatedTasks = allTasks.map((t) => {
      if (t.id !== task.id) return t;
      return { ...t, status };
    });
    setAllTasks(updatedTasks);
  };

  const tasksIds = useMemo(() => {
    return allTasks.map((task) => task.id);
  }, [allTasks]);

  const handleAddStoryClick = () => {
    setShowCreationForm(true);
  };
  const handleIcedStoriesClick = () => {
    setShowIcedStories(!showIcedStories);
  };
  const handleAcceptedStoriesClick = () => {
    setShowAcceptedStories(!showAcceptedStories);
  };

  const handleStoryCreationCallback = () => {
    setShowCreationForm(false);
  };

  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: {
      type: 'Column',
      column,
    } satisfies ColumnDragData,
    attributes: {
      roleDescription: `Column: ${column.name}`,
    },
  });
  const style = {
    transition,
    transform: CSS.Translate.toString(transform),
  };

  const variants = cva('h-full max-w-full bg-transparent flex flex-col flex-shrink-0 snap-center', {
    variants: {
      dragging: {
        default: 'border-2 border-transparent',
        over: 'ring-2 opacity-30',
        overlay: 'ring-2 ring-primary',
      },
    },
  });

  // TODO
  const [background, setBackground] = useState('#ff75c3');

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={variants({
        dragging: isOverlay ? 'overlay' : isDragging ? 'over' : undefined,
      })}
    >
      <CardHeader
        ref={ref as RefObject<HTMLDivElement>}
        className="p-3 text-normal leading-4 font-semibold border-b flex flex-row gap-2 space-between items-center"
      >
        <Button variant={'ghost'} {...attributes} {...listeners} size="xs" className=" px-0 text-primary/50 -ml-1 cursor-grab relative">
          <span className="sr-only">{`Move column: ${column.name}`}</span>
          <GripVertical size={16} />
        </Button>

        <BackgroundPicker background={background} setBackground={setBackground} options={['solid']} />

        <div>{column.name}</div>

        <div className="grow" />

        <ToolTipButtons key={column.id} rolledUp={bounds.width <= neededWidth} />

        <Button variant="plain" size="xs" className="rounded" onClick={handleAddStoryClick}>
          <Plus size={16} className="mr-1" />
          Story
        </Button>
      </CardHeader>
      <ScrollArea>
        <CardContent className="flex flex-grow flex-col p-0">
          {showCreationForm && <CreateStoryForm callback={handleStoryCreationCallback} />}

          {
            <Button
              onClick={handleAcceptedStoriesClick}
              variant="ghost"
              size="sm"
              className="w-full rounded-none gap-1 border-none opacity-75 hover:opacity-100 hover:bg-green-500/10 text-green-500 text-sm -mt-[1px]"
            >
              <span className="text-xs">3 accepted stories</span>
              <ChevronDown size={16} className={`transition-transform opacity-50 ${showAcceptedStories ? 'rotate-180' : 'rotate-0'}`} />
            </Button>
          }

          <SortableContext items={tasksIds}>
            {allTasks.map((task) => (
              <TaskCard
                setTaskStatus={setTaskStatus}
                isViewState={!foldedTasks.includes(task.id)}
                toggleTaskClick={toggleTaskVisibility}
                task={task}
                user={task.assignedTo}
                key={task.id}
              />
            ))}
          </SortableContext>
          {
            <Button
              onClick={handleIcedStoriesClick}
              variant="ghost"
              size="sm"
              className={`w-full rounded-none gap-1 border-none opacity-75 hover:opacity-100 text-sky-500 hover:bg-sky-500/10
              text-sm -mt-[1px]`}
            >
              <span className="text-xs">5 iced stories</span>
              <ChevronDown size={16} className={`transition-transform opacity-50 ${showIcedStories ? 'rotate-180' : 'rotate-0'}`} />
            </Button>
          }
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

export function BoardContainer({ children }: { children: React.ReactNode }) {
  const dndContext = useDndContext();

  const variations = cva('h-[calc(100vh-64px-64px)] md:h-[calc(100vh-88px)]', {
    variants: {
      dragging: {
        default: 'snap-x snap-mandatory',
        active: 'snap-none',
      },
    },
  });

  return <div className={variations({ dragging: dndContext.active ? 'active' : 'default' })}>{children}</div>;
}
