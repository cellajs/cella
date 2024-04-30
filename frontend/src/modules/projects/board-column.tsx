import { useDndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { cva } from 'class-variance-authority';
import { ChevronDown } from 'lucide-react';
import { useContext, useMemo, useState } from 'react';
import { Button } from '~/modules/ui/button';
import { CardContent } from '~/modules/ui/card';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { TaskCard } from './task-card';
import { ProjectContext } from './board';
import { BoardColumnHeader } from './board-column-header';

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
  const { tasks = [] } = useContext(ProjectContext);

  const tasksIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const acceptedCount = useMemo(() => tasks?.filter((t) => t.status === 6).length, [tasks]);
  const icedCount = useMemo(() => tasks?.filter((t) => t.status === 6).length, [tasks]);

  const [showIced, setShowIced] = useState(false);
  const [showAccepted, setShowAccepted] = useState(false);

  return (
    <BoardColumnHeader column={column} isOverlay={isOverlay}>
      <ScrollArea id={column.id}>
        <CardContent className="flex flex-grow flex-col p-0 group/column">
          {!!tasks.length && (
            <SortableContext items={tasksIds}>
              <Button
                onClick={() => setShowAccepted(!showAccepted)}
                variant="ghost"
                disabled={!acceptedCount}
                size="sm"
                className="w-full rounded-none gap-1 border-b opacity-75 hover:opacity-100 hover:bg-green-500/5 text-green-500 text-sm -mt-[1px]"
              >
                <span className="text-xs">{acceptedCount} accepted tasks</span>
                {!!acceptedCount && (
                  <ChevronDown size={16} className={`transition-transform opacity-50 ${showAccepted ? 'rotate-180' : 'rotate-0'}`} />
                )}
              </Button>
              {tasks
                .filter((t) => {
                  if (showAccepted && t.status === 6) return true;
                  if (showIced && t.status === 0) return true;
                  return t.status !== 0 && t.status !== 6;
                })
                .map((task) => (
                  <TaskCard task={task} key={task.id} />
                ))}
              <Button
                onClick={() => setShowIced(!showIced)}
                variant="ghost"
                disabled={!icedCount}
                size="sm"
                className="w-full rounded-none gap-1 opacity-75 hover:opacity-100 text-sky-500 hover:bg-sky-500/5 text-sm -mt-[1px]"
              >
                <span className="text-xs">{icedCount} iced tasks</span>
                {!!icedCount && <ChevronDown size={16} className={`transition-transform opacity-50 ${showIced ? 'rotate-180' : 'rotate-0'}`} />}
              </Button>
            </SortableContext>
          )}
        </CardContent>
      </ScrollArea>
    </BoardColumnHeader>
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
