import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove } from '@dnd-kit/sortable';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../ui/resizable';
import { BoardColumn, BoardContainer, type Column } from './board-column';
import { coordinateGetter } from './keyboard-preset';
import { TaskCard } from './task-card';
import { hasDraggableData } from './utils';
import { WorkspaceContext } from '../workspaces';
import type { Project, Task } from '../common/root/electric';
import { ProjectsContext } from '.';

interface ProjectContextValue {
  tasks: Task[];
  project: Project;
}

export const ProjectContext = createContext({} as ProjectContextValue);

export default function Board() {
  const { projects, tasks } = useContext(WorkspaceContext);
  const { searchQuery } = useContext(ProjectsContext);
  const pickedUpTaskColumn = useRef<string | null>(null);

  const [innerColumns, setInnerColumns] = useState<Project[]>(projects || []);
  const [activeColumn, setActiveColumn] = useState<Column | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const columnsId = useMemo(() => innerColumns.map((col) => col.id), [innerColumns]);

  const filteredTasks = useMemo(() => {
    if (!searchQuery) return tasks;
    return tasks.filter(
      (task) =>
        task.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.markdown?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.slug.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [searchQuery, tasks]);

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: coordinateGetter,
    }),
  );

  function getDraggingTaskData(taskId: string, columnId: string) {
    const tasksInColumn = filteredTasks.filter((task) => task.project_id === columnId);
    const taskPosition = tasksInColumn.findIndex((task) => task.id === taskId);
    const column = innerColumns.find((col) => col.id === columnId);
    return {
      tasksInColumn,
      taskPosition,
      column,
    };
  }

  useEffect(() => {
    setInnerColumns(projects);
  }, [projects]);

  const announcements: Announcements = {
    onDragStart({ active }) {
      if (!hasDraggableData(active)) return;
      if (active.data.current?.type === 'Column') {
        const startColumnIdx = columnsId.findIndex((id) => id === active.id);
        const startColumn = innerColumns[startColumnIdx];
        return `Picked up Column ${startColumn?.name} at position: ${startColumnIdx + 1} of ${columnsId.length}`;
      }
      if (active.data.current?.type === 'Task') {
        pickedUpTaskColumn.current = active.data.current.task.project_id;
        const { tasksInColumn, taskPosition, column } = getDraggingTaskData(active.id.toString(), pickedUpTaskColumn.current);
        return `Picked up Task at position: ${taskPosition + 1} of ${tasksInColumn.length} in column ${column?.name}`;
      }
    },
    onDragOver({ active, over }) {
      if (!hasDraggableData(active) || !hasDraggableData(over)) return;

      if (active.data.current?.type === 'Column' && over.data.current?.type === 'Column') {
        const overColumnIdx = columnsId.findIndex((id) => id === over.id);
        return `Column ${active.data.current.column.name} was moved over ${over.data.current.column.name} at position ${overColumnIdx + 1} of ${
          columnsId.length
        }`;
      }
      if (active.data.current?.type === 'Task' && over.data.current?.type === 'Task') {
        const { tasksInColumn, taskPosition, column } = getDraggingTaskData(over.id.toString(), over.data.current.task.project_id);
        if (over.data.current.task.project_id !== pickedUpTaskColumn.current) {
          return `Task was moved over column ${column?.name} in position ${taskPosition + 1} of ${tasksInColumn.length}`;
        }
        return `Task was moved over position ${taskPosition + 1} of ${tasksInColumn.length} in column ${column?.name}`;
      }
    },
    onDragEnd({ active, over }) {
      if (!hasDraggableData(active) || !hasDraggableData(over)) {
        pickedUpTaskColumn.current = null;
        return;
      }
      if (active.data.current?.type === 'Column' && over.data.current?.type === 'Column') {
        const overColumnPosition = columnsId.findIndex((id) => id === over.id);

        return `Column ${active.data.current.column.name} was dropped into position ${overColumnPosition + 1} of ${columnsId.length}`;
      }
      if (active.data.current?.type === 'Task' && over.data.current?.type === 'Task') {
        const { tasksInColumn, taskPosition, column } = getDraggingTaskData(over.id.toString(), over.data.current.task.project_id);
        if (over.data.current.task.project_id !== pickedUpTaskColumn.current) {
          return `Task was dropped into column ${column?.name} in position ${taskPosition + 1} of ${tasksInColumn.length}`;
        }
        return `Task was dropped into position ${taskPosition + 1} of ${tasksInColumn.length} in column ${column?.name}`;
      }
      pickedUpTaskColumn.current = null;
    },
    onDragCancel({ active }) {
      pickedUpTaskColumn.current = null;
      if (!hasDraggableData(active)) return;
      return `Dragging ${active.data.current?.type} cancelled.`;
    },
  };

  return (
    <DndContext accessibility={{ announcements }} sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver}>
      <BoardContainer>
        <ResizablePanelGroup direction="horizontal" className="flex gap-2" id="project-panels">
          <SortableContext items={columnsId}>
            {projects.map((project, index) => (
              <Fragment key={project.id}>
                <ResizablePanel key={`${project.id}-panel`}>
                  <ProjectContext.Provider value={{ tasks: filteredTasks.filter((t) => t.project_id === project.id), project }}>
                    <BoardColumn column={{ id: project.id, name: project.name }} key={`${project.id}-column`} />
                  </ProjectContext.Provider>
                </ResizablePanel>
                {innerColumns.length > index + 1 && (
                  <ResizableHandle className="w-[4px] border border-background -mx-[6px] bg-transparent hover:bg-primary/50 data-[resize-handle-state=drag]:bg-primary transition-all" />
                )}
              </Fragment>
            ))}
          </SortableContext>
        </ResizablePanelGroup>
      </BoardContainer>

      {'document' in window &&
        createPortal(
          <DragOverlay>
            {activeColumn && <BoardColumn isOverlay column={activeColumn} />}
            {activeTask && <TaskCard task={activeTask} isOverlay />}
          </DragOverlay>,
          document.body,
        )}
    </DndContext>
  );

  function onDragStart(event: DragStartEvent) {
    if (!hasDraggableData(event.active)) return;
    const data = event.active.data.current;
    if (data?.type === 'Column') {
      setActiveColumn(data.column);
      return;
    }

    if (data?.type === 'Task') {
      setActiveTask(data.task);
      return;
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveColumn(null);
    setActiveTask(null);

    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (!hasDraggableData(active)) return;

    const activeData = active.data.current;

    if (activeId === overId) return;

    const isActiveAColumn = activeData?.type === 'Column';
    if (!isActiveAColumn) return;

    setInnerColumns((innerColumns) => {
      const activeColumnIndex = innerColumns.findIndex((col) => col.id === activeId);

      const overColumnIndex = innerColumns.findIndex((col) => col.id === overId);

      return arrayMove(innerColumns, activeColumnIndex, overColumnIndex);
    });
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    if (!hasDraggableData(active) || !hasDraggableData(over)) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    const isActiveATask = activeData?.type === 'Task';
    const isOverATask = activeData?.type === 'Task';

    if (!isActiveATask) return;

    // Im dropping a Task over another Task
    if (isActiveATask && isOverATask) {
      const activeIndex = filteredTasks.findIndex((t) => t.id === activeId);
      const overIndex = filteredTasks.findIndex((t) => t.id === overId);
      const activeTask = filteredTasks[activeIndex];
      const overTask = filteredTasks[overIndex];
      if (activeTask && overTask && activeTask.project_id !== overTask.project_id) {
        activeTask.project_id = overTask.project_id;
        return arrayMove(filteredTasks, activeIndex, overIndex - 1);
      }

      return arrayMove(filteredTasks, activeIndex, overIndex);
    }

    const isOverAColumn = overData?.type === 'Column';

    // Im dropping a Task over a column
    if (isActiveATask && isOverAColumn) {
      const activeIndex = filteredTasks.findIndex((t) => t.id === activeId);
      const activeTask = filteredTasks[activeIndex];
      if (activeTask) {
        activeTask.project_id = String(overId);
        return arrayMove(filteredTasks, activeIndex, activeIndex);
      }
      return filteredTasks;
    }
  }
}
