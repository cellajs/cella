import { useDndContext } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cva } from 'class-variance-authority';
import { ChevronDown, GripVertical, Plus } from 'lucide-react';
import { type RefObject, useContext, useMemo, useRef, useState } from 'react';
import { BackgroundPicker } from '~/modules/common/background-picker';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardHeader } from '~/modules/ui/card';
import { ScrollArea } from '~/modules/ui/scroll-area';
import ToolTipButtons from './tooltip-buttons';
import { useMeasure } from '~/hooks/use-measure';
import { TaskCard } from './task-card';
import CreateTaskForm from './task-form';
import { ProjectContext } from './board';
import { sheet } from '../common/sheeter/state';
import { ProjectSettings } from './project-settings';
import { useTranslation } from 'react-i18next';

export interface Column {
  id: string;
  name: string;
}

export interface ColumnDragData {
  type: 'Column';
  column: Column;
}

interface BoardColumnProps {
  column: Column;
  isOverlay?: boolean;
}

export function BoardColumn({ column, isOverlay }: BoardColumnProps) {
  const { t } = useTranslation();

  const { tasks } = useContext(ProjectContext);
  const tasksIds = useMemo(() => tasks.map((task) => task.id), [tasks]);

  const [createForm, setCreateForm] = useState(false);
  const [showIced, setShowIced] = useState(false);
  const [showAccepted, setShowAccepted] = useState(false);

  const containerRef = useRef(null);
  const { ref, bounds } = useMeasure();

  const neededWidth = 375;

  const openSettingsSheet = () => {
    sheet(<ProjectSettings />, {
      className: 'sm:max-w-[64rem]',
      title: t('common:project_settings'),
      text: t('common:project_settings.text'),
      id: 'project_settings',
    });
  };

  const handleTaskFormClick = () => {
    if (!createForm) {
      const container = document.getElementById(`${column.id}-viewport`);
      container?.scrollTo({ top: 0, behavior: 'smooth' });
    }

    setCreateForm(!createForm);
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
        <Button variant={'ghost'} {...attributes} {...listeners} size="xs" className="max-xs:hidden px-0 text-primary/50 -ml-1 cursor-grab relative">
          <span className="sr-only">{`Move column: ${column.name}`}</span>
          <GripVertical size={16} />
        </Button>

        <BackgroundPicker background={background} setBackground={setBackground} options={['solid']} />

        <div>{column.name}</div>

        <div className="grow" />

        <ToolTipButtons key={column.id} rolledUp={bounds.width <= neededWidth} onSettingsClick={openSettingsSheet} />

        <Button variant="plain" size="xs" className="rounded" onClick={handleTaskFormClick}>
          <Plus size={16} className={`transition-transform ${createForm ? 'rotate-45 scale-125' : 'rotate-0'}`} />
          <span className="ml-1">Task</span>
        </Button>
      </CardHeader>
      <ScrollArea id={column.id}>
        <CardContent className="flex flex-grow flex-col p-0">
          {createForm && <CreateTaskForm onCloseForm={() => setCreateForm(false)} />}

          <Button
            onClick={() => setShowAccepted(!showAccepted)}
            variant="ghost"
            size="sm"
            className="w-full rounded-none gap-1 border-b opacity-75 hover:opacity-100 hover:bg-green-500/5 text-green-500 text-sm -mt-[1px]"
          >
            <span className="text-xs">{tasks.filter((t) => t.status === 6).length} accepted tasks</span>
            <ChevronDown size={16} className={`transition-transform opacity-50 ${showAccepted ? 'rotate-180' : 'rotate-0'}`} />
          </Button>

          <div ref={containerRef} />
          <SortableContext items={tasksIds}>
            {tasks.map((task) => (
              <TaskCard task={task} key={task.id} />
            ))}
          </SortableContext>

          <Button
            onClick={() => setShowIced(!showIced)}
            variant="ghost"
            size="sm"
            className={`w-full rounded-none gap-1 opacity-75 hover:opacity-100 text-sky-500 hover:bg-sky-500/5
              text-sm -mt-[1px]`}
          >
            <span className="text-xs">{tasks.filter((t) => t.status === 0).length} iced tasks</span>
            <ChevronDown size={16} className={`transition-transform opacity-50 ${showIced ? 'rotate-180' : 'rotate-0'}`} />
          </Button>
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
