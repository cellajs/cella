import { useDndContext } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { cva } from 'class-variance-authority';
import { ChevronDown } from 'lucide-react';
import { useContext, useMemo, useRef, useState } from 'react';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { TaskCard } from './task-card';
import { ProjectContext } from './board';
import { BoardColumnHeader } from './board-column-header';
import { CSS } from '@dnd-kit/utilities';
import { ProjectSettings } from './project-settings';
import { sheet } from '../common/sheeter/state';
import CreateTaskForm from './task-form';
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
  const containerRef = useRef(null);
  const { tasks = [] } = useContext(ProjectContext);

  const tasksIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const acceptedCount = useMemo(() => tasks?.filter((t) => t.status === 6).length, [tasks]);
  const icedCount = useMemo(() => tasks?.filter((t) => t.status === 0).length, [tasks]);

  const [showIced, setShowIced] = useState(false);
  const [showAccepted, setShowAccepted] = useState(false);
  const [createForm, setCreateForm] = useState(false);

  const openSettingsSheet = () => {
    sheet(<ProjectSettings />, {
      className: 'sm:max-w-[64rem]',
      title: t('common:project_settings'),
      text: t('common:project_settings.text'),
      id: 'project_settings',
    });
  };

  const handleTaskFormClick = () => {
    if (createForm) return;
    const container = document.getElementById(`${column.id}-viewport`);
    container?.scrollTo({ top: 0, behavior: 'smooth' });
    setCreateForm(!createForm);
  };

  // const createTask = () => {
  //   dialog(<CreateTaskForm project={project} dialog />, {
  //     className: 'md:max-w-xl',
  //     title: t('common:create_task'),
  //   });
  // };

  // const onDelete = () => {
  //   db.projects.delete({ where: { id: project.id } });
  // };

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

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={variants({
        dragging: isOverlay ? 'overlay' : isDragging ? 'over' : undefined,
      })}
    >
      <BoardColumnHeader
        column={column}
        attributes={attributes}
        listeners={listeners}
        createFormClick={handleTaskFormClick}
        openSettings={openSettingsSheet}
        createFormOpen={createForm}
      >
        {createForm && <CreateTaskForm onCloseForm={() => setCreateForm(false)} />}
      </BoardColumnHeader>
      <div ref={containerRef} />
      <ScrollArea id={column.id} size="indicatorVertical">
        <ScrollBar size="indicatorVertical" />
        <CardContent className="flex flex-grow flex-col p-0 group/column">
          {!!tasks.length && (
            <>
              <Button
                onClick={() => setShowAccepted(!showAccepted)}
                variant="ghost"
                disabled={!acceptedCount}
                size="sm"
                className="w-full rounded-none gap-1 border-b ring-inset opacity-75 hover:opacity-100 hover:bg-green-500/5 text-green-500 text-sm -mt-[1px]"
              >
                <span className="text-xs">{acceptedCount} accepted</span>
                {!!acceptedCount && (
                  <ChevronDown size={16} className={`transition-transform opacity-50 ${showAccepted ? 'rotate-180' : 'rotate-0'}`} />
                )}
              </Button>

              <SortableContext items={tasksIds}>
                {tasks
                  .filter((t) => {
                    if (showAccepted && t.status === 6) return true;
                    if (showIced && t.status === 0) return true;
                    return t.status !== 0 && t.status !== 6;
                  })
                  .map((task) => (
                    <TaskCard task={task} key={task.id} />
                  ))}
              </SortableContext>
              <Button
                onClick={() => setShowIced(!showIced)}
                variant="ghost"
                disabled={!icedCount}
                size="sm"
                className="w-full rounded-none gap-1 ring-inset opacity-75 hover:opacity-100 text-sky-500 hover:bg-sky-500/5 text-sm -mt-[1px]"
              >
                <span className="text-xs">{icedCount} iced</span>
                {!!icedCount && <ChevronDown size={16} className={`transition-transform opacity-50 ${showIced ? 'rotate-180' : 'rotate-0'}`} />}
              </Button>
            </>
          )}
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
        default: 'snap-y snap-mandatory',
        active: 'snap-none',
      },
    },
  });

  return <div className={variations({ dragging: dndContext.active ? 'active' : 'default' })}>{children}</div>;
}
