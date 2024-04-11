import { Fragment, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { useLiveQuery } from 'electric-sql/react';
import { t } from 'i18next';
import { Plus } from 'lucide-react';
import { dialog } from '../common/dialoger/state';
import { useElectric, type Project, type Task } from '../common/root/electric';
import { OrganizationContext } from '../organizations/organization';
import { Button } from '../ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../ui/resizable';
import { BoardColumn, BoardContainer } from './board-column';
import CreateProjectForm from './create-project-form';
import { coordinateGetter } from './keyboard-preset';
import { TaskCard } from './task-card';

export default function KanbanBoard() {
  const { organization } = useContext(OrganizationContext);

  const [columns, setColumns] = useState<Project[]>([]);
  // const pickedUpTaskColumn = useRef<string | null>(null);
  const columnsId = useMemo(() => columns.map((col) => col.id), [columns]);

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const { db } = useElectric()!;

  const { results: dbProjects } = useLiveQuery(db.projects.liveMany());

  useEffect(() => {
    setColumns(dbProjects || []);
  }, [dbProjects]);

  const [tasks, setTasks] = useState<Task[]>([]);

  const { results: dbTasks } = useLiveQuery(db.tasks.liveMany());

  useEffect(() => {
    setTasks(dbTasks || []);
  }, [dbTasks]);

  const [activeColumn, _setActiveColumn] = useState<Project | null>(null);

  const [activeTask, _setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: coordinateGetter,
    }),
  );

  // function getDraggingTaskData(taskId: UniqueIdentifier, columnId: string) {
  //   const tasksInColumn = tasks.filter((task) => task.project_id === columnId);
  //   const taskPosition = tasksInColumn.findIndex((task) => task.id === taskId);
  //   const column = columns.find((col) => col.id === columnId);
  //   return {
  //     tasksInColumn,
  //     taskPosition,
  //     column,
  //   };
  // }

  // const announcements: Announcements = {
  //   onDragStart({ active }) {
  //     if (!hasDraggableData(active)) return;
  //     if (active.data.current?.type === 'Column') {
  //       const startColumnIdx = columnsId.findIndex((id) => id === active.id);
  //       const startColumn = columns[startColumnIdx];
  //       return `Picked up Column ${startColumn?.name} at position: ${startColumnIdx + 1} of ${columnsId.length}`;
  //     }
  //     if (active.data.current?.type === 'Task') {
  //       pickedUpTaskColumn.current = active.data.current.task.project_id;
  //       const { tasksInColumn, taskPosition, column } = getDraggingTaskData(active.id, pickedUpTaskColumn.current!);
  //       return `Picked up Task ${active.data.current.task.description} at position: ${taskPosition + 1} of ${tasksInColumn.length} in column ${
  //         column?.name
  //       }`;
  //     }
  //   },
  //   onDragOver({ active, over }) {
  //     if (!hasDraggableData(active) || !hasDraggableData(over)) return;

  //     if (active.data.current?.type === 'Column' && over.data.current?.type === 'Column') {
  //       const overColumnIdx = columnsId.findIndex((id) => id === over.id);
  //       return `Column ${active.data.current.column.name} was moved over ${over.data.current.column.name} at position ${overColumnIdx + 1} of ${
  //         columnsId.length
  //       }`;
  //     }
  //     if (active.data.current?.type === 'Task' && over.data.current?.type === 'Task') {
  //       const { tasksInColumn, taskPosition, column } = getDraggingTaskData(over.id, over.data.current.task.project_id!);
  //       if (over.data.current.task.project_id !== pickedUpTaskColumn.current) {
  //         return `Task ${active.data.current.task.description} was moved over column ${column?.name} in position ${taskPosition + 1} of ${
  //           tasksInColumn.length
  //         }`;
  //       }
  //       return `Task was moved over position ${taskPosition + 1} of ${tasksInColumn.length} in column ${column?.name}`;
  //     }
  //   },
  //   onDragEnd({ active, over }) {
  //     if (!hasDraggableData(active) || !hasDraggableData(over)) {
  //       pickedUpTaskColumn.current = null;
  //       return;
  //     }
  //     if (active.data.current?.type === 'Column' && over.data.current?.type === 'Column') {
  //       const overColumnPosition = columnsId.findIndex((id) => id === over.id);

  //       return `Column ${active.data.current.column.name} was dropped into position ${overColumnPosition + 1} of ${columnsId.length}`;
  //     }
  //     if (active.data.current?.type === 'Task' && over.data.current?.type === 'Task') {
  //       const { tasksInColumn, taskPosition, column } = getDraggingTaskData(over.id, over.data.current.task.project_id!);
  //       if (over.data.current.task.project_id !== pickedUpTaskColumn.current) {
  //         return `Task was dropped into column ${column?.name} in position ${taskPosition + 1} of ${tasksInColumn.length}`;
  //       }
  //       return `Task was dropped into position ${taskPosition + 1} of ${tasksInColumn.length} in column ${column?.name}`;
  //     }
  //     pickedUpTaskColumn.current = null;
  //   },
  //   onDragCancel({ active }) {
  //     pickedUpTaskColumn.current = null;
  //     if (!hasDraggableData(active)) return;
  //     return `Dragging ${active.data.current?.type} cancelled.`;
  //   },
  // };

  return (
    <DndContext
      // accessibility={{ announcements }}
      sensors={sensors}
      //  onDragStart={onDragStart}
      //  onDragEnd={onDragEnd}
      //  onDragOver={onDragOver}
    >
      <Button
        onClick={() => {
          dialog(<CreateProjectForm organization={organization} dialog />, {
            className: 'md:max-w-xl',
            title: t('common:create_project'),
          });
        }}
      >
        <Plus size={16} />
        <span className="ml-1">{t('common:create')}</span>
      </Button>
      <BoardContainer>
        <ResizablePanelGroup direction="horizontal" className="flex gap-2">
          <SortableContext items={columnsId}>
            {columns.map((col, index) => (
              <Fragment key={col.id}>
                <ResizablePanel key={`${col.id}-panel`}>
                  <BoardColumn key={`${col.id}-column`} project={col} tasks={tasks.filter((task) => task.project_id === col.id)} />
                </ResizablePanel>
                {columns.length > index + 1 && <ResizableHandle className="w-[2px] hover:border" />}
              </Fragment>
            ))}
          </SortableContext>
        </ResizablePanelGroup>
      </BoardContainer>

      {'document' in window &&
        createPortal(
          <DragOverlay>
            {activeColumn && <BoardColumn isOverlay project={activeColumn} tasks={tasks.filter((task) => task.project_id === activeColumn.id)} />}
            {activeTask && <TaskCard task={activeTask} isOverlay />}
          </DragOverlay>,
          document.body,
        )}
    </DndContext>
  );

  // function onDragStart(event: DragStartEvent) {
  //   if (!hasDraggableData(event.active)) return;
  //   const data = event.active.data.current;
  //   if (data?.type === 'Column') {
  //     setActiveColumn(data.column);
  //     return;
  //   }

  //   if (data?.type === 'Task') {
  //     setActiveTask(data.task);
  //     return;
  //   }
  // }

  // function onDragEnd(event: DragEndEvent) {
  //   setActiveColumn(null);
  //   setActiveTask(null);

  //   const { active, over } = event;
  //   if (!over) return;

  //   const activeId = active.id;
  //   const overId = over.id;

  //   if (!hasDraggableData(active)) return;

  //   const activeData = active.data.current;

  //   if (activeId === overId) return;

  //   const isActiveAColumn = activeData?.type === 'Column';
  //   if (!isActiveAColumn) return;

  //   setColumns((columns) => {
  //     const activeColumnIndex = columns.findIndex((col) => col.id === activeId);

  //     const overColumnIndex = columns.findIndex((col) => col.id === overId);

  //     return arrayMove(columns, activeColumnIndex, overColumnIndex);
  //   });
  // }

  // function onDragOver(event: DragOverEvent) {
  //   const { active, over } = event;
  //   if (!over) return;

  //   const activeId = active.id;
  //   const overId = over.id;

  //   if (activeId === overId) return;

  //   if (!hasDraggableData(active) || !hasDraggableData(over)) return;

  //   const activeData = active.data.current;
  //   const overData = over.data.current;

  //   const isActiveATask = activeData?.type === 'Task';
  //   const isOverATask = activeData?.type === 'Task';

  //   if (!isActiveATask) return;

  //   // Im dropping a Task over another Task
  //   if (isActiveATask && isOverATask) {
  //     setTasks((tasks) => {
  //       const activeIndex = tasks.findIndex((t) => t.id === activeId);
  //       const overIndex = tasks.findIndex((t) => t.id === overId);
  //       const activeTask = tasks[activeIndex];
  //       const overTask = tasks[overIndex];
  //       if (activeTask && overTask && activeTask.project_id !== overTask.project_id) {
  //         activeTask.project_id = overTask.project_id;
  //         return arrayMove(tasks, activeIndex, overIndex - 1);
  //       }

  //       return arrayMove(tasks, activeIndex, overIndex);
  //     });
  //   }

  //   const isOverAColumn = overData?.type === 'Column';

  //   // Im dropping a Task over a column
  //   if (isActiveATask && isOverAColumn) {
  //     setTasks((tasks) => {
  //       const activeIndex = tasks.findIndex((t) => t.id === activeId);
  //       const activeTask = tasks[activeIndex];
  //       if (activeTask) {
  //         activeTask.project_id = overId;
  //         return arrayMove(tasks, activeIndex, activeIndex);
  //       }
  //       return tasks;
  //     });
  //   }
  // }
}
